// Native drag-out for Windows: drags files as CF_HDROP via the shell's drag loop and reports
// the effect the drop target performed (none / copy / move / link).
#include <windows.h>
#include <shlobj.h>
#include <shellapi.h>
#include <node_api.h>
#include <string>
#include <vector>

static napi_value Throw(napi_env env, const char* message) {
  napi_throw_error(env, nullptr, message);
  return nullptr;
}

static std::wstring Utf8ToWide(const std::string& s) {
  int n = MultiByteToWideChar(CP_UTF8, 0, s.c_str(), -1, nullptr, 0);
  std::wstring w(n > 0 ? n - 1 : 0, L'\0');
  if (n > 1) MultiByteToWideChar(CP_UTF8, 0, s.c_str(), -1, w.data(), n);
  return w;
}

static bool GetString(napi_env env, napi_value value, std::string* out) {
  size_t len = 0;
  if (napi_get_value_string_utf8(env, value, nullptr, 0, &len) != napi_ok) return false;
  out->resize(len);
  return napi_get_value_string_utf8(env, value, out->data(), len + 1, &len) == napi_ok;
}

// DROPFILES header followed by double-NUL-terminated wide paths.
static HGLOBAL MakeHDrop(const std::vector<std::wstring>& paths) {
  size_t chars = 1;
  for (const auto& p : paths) chars += p.size() + 1;
  HGLOBAL mem = GlobalAlloc(GHND, sizeof(DROPFILES) + chars * sizeof(wchar_t));
  if (!mem) return nullptr;
  auto* df = static_cast<DROPFILES*>(GlobalLock(mem));
  df->pFiles = sizeof(DROPFILES);
  df->fWide = TRUE;
  auto* dst = reinterpret_cast<wchar_t*>(reinterpret_cast<BYTE*>(df) + sizeof(DROPFILES));
  for (const auto& p : paths) {
    memcpy(dst, p.c_str(), (p.size() + 1) * sizeof(wchar_t));
    dst += p.size() + 1;
  }
  *dst = L'\0';
  GlobalUnlock(mem);
  return mem;
}

// Explorer performs same-volume moves itself ("optimized move") and then returns DROPEFFECT_NONE;
// the real outcome is written back into the data object as CFSTR_PERFORMEDDROPEFFECT.
static DWORD PerformedEffect(IDataObject* data) {
  FORMATETC fmt = {static_cast<CLIPFORMAT>(RegisterClipboardFormatW(CFSTR_PERFORMEDDROPEFFECT)), nullptr, DVASPECT_CONTENT, -1, TYMED_HGLOBAL};
  STGMEDIUM medium = {};
  if (FAILED(data->GetData(&fmt, &medium))) return DROPEFFECT_NONE;
  DWORD effect = DROPEFFECT_NONE;
  if (auto* p = static_cast<DWORD*>(GlobalLock(medium.hGlobal))) {
    effect = *p;
    GlobalUnlock(medium.hGlobal);
  }
  ReleaseStgMedium(&medium);
  return effect;
}

static const char* EffectName(DWORD effect) {
  if (effect & DROPEFFECT_MOVE) return "move";
  if (effect & DROPEFFECT_COPY) return "copy";
  if (effect & DROPEFFECT_LINK) return "link";
  return "none";
}

// startDrag(nativeWindowHandle: Buffer, paths: string[], onEnd: (r) => void): boolean
// Blocks in the OS drag loop and calls onEnd before returning.
static napi_value StartDrag(napi_env env, napi_callback_info info) {
  size_t argc = 3;
  napi_value argv[3];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  if (argc < 3) return Throw(env, "startDrag(handle, paths, onEnd) expects 3 arguments");

  void* handleData = nullptr;
  size_t handleLen = 0;
  if (napi_get_buffer_info(env, argv[0], &handleData, &handleLen) != napi_ok || handleLen < sizeof(HWND)) {
    return Throw(env, "handle must be the Buffer from getNativeWindowHandle()");
  }
  HWND hwnd = *static_cast<HWND*>(handleData);

  uint32_t count = 0;
  if (napi_get_array_length(env, argv[1], &count) != napi_ok || count == 0) return Throw(env, "paths must be a non-empty array");
  std::vector<std::wstring> paths;
  for (uint32_t i = 0; i < count; i++) {
    napi_value item;
    std::string path;
    napi_get_element(env, argv[1], i, &item);
    if (!GetString(env, item, &path)) return Throw(env, "paths must be strings");
    paths.push_back(Utf8ToWide(path));
  }

  OleInitialize(nullptr);  // already initialized on Electron's UI thread; harmless S_FALSE then
  IDataObject* data = nullptr;
  if (FAILED(SHCreateDataObject(nullptr, 0, nullptr, nullptr, IID_PPV_ARGS(&data)))) return Throw(env, "SHCreateDataObject failed");

  FORMATETC fmt = {CF_HDROP, nullptr, DVASPECT_CONTENT, -1, TYMED_HGLOBAL};
  STGMEDIUM medium = {};
  medium.tymed = TYMED_HGLOBAL;
  medium.hGlobal = MakeHDrop(paths);
  if (!medium.hGlobal || FAILED(data->SetData(&fmt, &medium, TRUE))) {
    if (medium.hGlobal) GlobalFree(medium.hGlobal);
    data->Release();
    return Throw(env, "could not build CF_HDROP");
  }

  DWORD effect = DROPEFFECT_NONE;
  HRESULT hr = SHDoDragDrop(hwnd, data, nullptr, DROPEFFECT_COPY | DROPEFFECT_MOVE | DROPEFFECT_LINK, &effect);
  if (hr == DRAGDROP_S_DROP && effect == DROPEFFECT_NONE) effect = PerformedEffect(data);
  if (hr != DRAGDROP_S_DROP) effect = DROPEFFECT_NONE;
  data->Release();

  POINT pt = {};
  GetCursorPos(&pt);
  napi_value result, op, x, y, undefined;
  napi_create_object(env, &result);
  napi_create_string_utf8(env, EffectName(effect), NAPI_AUTO_LENGTH, &op);
  napi_create_double(env, pt.x, &x);
  napi_create_double(env, pt.y, &y);
  napi_set_named_property(env, result, "operation", op);
  napi_set_named_property(env, result, "x", x);
  napi_set_named_property(env, result, "y", y);
  napi_get_undefined(env, &undefined);
  napi_call_function(env, undefined, argv[2], 1, &result, nullptr);

  napi_value ok;
  napi_get_boolean(env, SUCCEEDED(hr), &ok);
  return ok;
}

static std::string WideToUtf8(const std::wstring& w) {
  int n = WideCharToMultiByte(CP_UTF8, 0, w.c_str(), -1, nullptr, 0, nullptr, nullptr);
  std::string s(n > 0 ? n - 1 : 0, '\0');
  if (n > 1) WideCharToMultiByte(CP_UTF8, 0, w.c_str(), -1, s.data(), n, nullptr, nullptr);
  return s;
}

static void SetString(napi_env env, napi_value obj, const char* key, const std::string& value) {
  napi_value v;
  napi_create_string_utf8(env, value.c_str(), NAPI_AUTO_LENGTH, &v);
  napi_set_named_property(env, obj, key, v);
}

// appAtPoint(x, y): { id, name, exe } | null — process owning the top-level window under a
// physical screen point.
static napi_value AppAtPoint(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  double x = 0, y = 0;
  if (argc < 2 || napi_get_value_double(env, argv[0], &x) != napi_ok || napi_get_value_double(env, argv[1], &y) != napi_ok) {
    return Throw(env, "appAtPoint(x, y) expects two numbers");
  }
  napi_value result;
  napi_get_null(env, &result);
  POINT pt = {static_cast<LONG>(x), static_cast<LONG>(y)};
  HWND hwnd = WindowFromPoint(pt);
  if (!hwnd) return result;
  hwnd = GetAncestor(hwnd, GA_ROOT);
  DWORD pid = 0;
  GetWindowThreadProcessId(hwnd, &pid);
  if (!pid || pid == GetCurrentProcessId()) return result;
  HANDLE proc = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
  if (!proc) return result;
  wchar_t buf[MAX_PATH * 2];
  DWORD len = static_cast<DWORD>(sizeof(buf) / sizeof(buf[0]));
  BOOL ok = QueryFullProcessImageNameW(proc, 0, buf, &len);
  CloseHandle(proc);
  if (!ok) return result;
  std::wstring path(buf, len);
  size_t slash = path.find_last_of(L"\\/");
  std::string exe = WideToUtf8(slash == std::wstring::npos ? path : path.substr(slash + 1));
  std::string name = exe.size() > 4 && _stricmp(exe.c_str() + exe.size() - 4, ".exe") == 0 ? exe.substr(0, exe.size() - 4) : exe;
  napi_create_object(env, &result);
  SetString(env, result, "id", "");
  SetString(env, result, "name", name);
  SetString(env, result, "exe", exe);
  return result;
}

static napi_value Init(napi_env env, napi_value exports) {
  napi_value fn;
  napi_create_function(env, "startDrag", NAPI_AUTO_LENGTH, StartDrag, nullptr, &fn);
  napi_set_named_property(env, exports, "startDrag", fn);
  napi_create_function(env, "appAtPoint", NAPI_AUTO_LENGTH, AppAtPoint, nullptr, &fn);
  napi_set_named_property(env, exports, "appAtPoint", fn);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
