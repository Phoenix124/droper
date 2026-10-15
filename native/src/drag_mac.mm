// Native drag-out for macOS: starts an NSDraggingSession for file URLs and reports the
// operation the drop target performed (none / copy / move / link / generic).
#import <AppKit/AppKit.h>
#include <node_api.h>
#include <string>
#include <vector>

struct DragEnd {
  std::string operation;
  double x;
  double y;
};

static const char* OperationName(NSDragOperation op) {
  if (op == NSDragOperationNone) return "none";
  if (op & NSDragOperationMove) return "move";
  if (op & NSDragOperationCopy) return "copy";
  if (op & NSDragOperationLink) return "link";
  return "generic";
}

static void CallJs(napi_env env, napi_value callback, void*, void* data) {
  DragEnd* end = static_cast<DragEnd*>(data);
  if (env != nullptr && callback != nullptr) {
    napi_value result, op, x, y, undefined;
    napi_create_object(env, &result);
    napi_create_string_utf8(env, end->operation.c_str(), NAPI_AUTO_LENGTH, &op);
    napi_create_double(env, end->x, &x);
    napi_create_double(env, end->y, &y);
    napi_set_named_property(env, result, "operation", op);
    napi_set_named_property(env, result, "x", x);
    napi_set_named_property(env, result, "y", y);
    napi_get_undefined(env, &undefined);
    napi_call_function(env, undefined, callback, 1, &result, nullptr);
  }
  delete end;
}

@interface DroperDragSource : NSObject <NSDraggingSource>
@property(nonatomic) napi_threadsafe_function tsfn;
@end

// Sources must outlive the call that started the session.
static NSMutableSet<DroperDragSource*>* gActiveSources;

@implementation DroperDragSource
- (NSDragOperation)draggingSession:(NSDraggingSession*)session
    sourceOperationMaskForDraggingContext:(NSDraggingContext)context {
  return NSDragOperationCopy | NSDragOperationMove | NSDragOperationLink | NSDragOperationGeneric;
}

- (void)draggingSession:(NSDraggingSession*)session
           endedAtPoint:(NSPoint)screenPoint
              operation:(NSDragOperation)operation {
  // Cocoa screen coordinates start bottom-left of the primary screen; Electron's start top-left.
  CGFloat primaryHeight = NSScreen.screens.firstObject.frame.size.height;
  DragEnd* end = new DragEnd{OperationName(operation), screenPoint.x, primaryHeight - screenPoint.y};
  napi_call_threadsafe_function(self.tsfn, end, napi_tsfn_nonblocking);
  napi_release_threadsafe_function(self.tsfn, napi_tsfn_release);
  [gActiveSources removeObject:self];
}
@end

static napi_value Throw(napi_env env, const char* message) {
  napi_throw_error(env, nullptr, message);
  return nullptr;
}

static bool GetString(napi_env env, napi_value value, std::string* out) {
  size_t len = 0;
  if (napi_get_value_string_utf8(env, value, nullptr, 0, &len) != napi_ok) return false;
  out->resize(len);
  return napi_get_value_string_utf8(env, value, out->data(), len + 1, &len) == napi_ok;
}

// startDrag(nativeWindowHandle: Buffer, paths: string[], onEnd: (r) => void): boolean
static napi_value StartDrag(napi_env env, napi_callback_info info) {
  size_t argc = 3;
  napi_value argv[3];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  if (argc < 3) return Throw(env, "startDrag(handle, paths, onEnd) expects 3 arguments");

  void* handleData = nullptr;
  size_t handleLen = 0;
  if (napi_get_buffer_info(env, argv[0], &handleData, &handleLen) != napi_ok || handleLen < sizeof(void*)) {
    return Throw(env, "handle must be the Buffer from getNativeWindowHandle()");
  }
  NSView* view = (__bridge NSView*)(*static_cast<void**>(handleData));
  NSWindow* window = view.window;
  if (window == nil) return Throw(env, "window handle has no NSWindow");

  uint32_t count = 0;
  if (napi_get_array_length(env, argv[1], &count) != napi_ok || count == 0) return Throw(env, "paths must be a non-empty array");
  std::vector<std::string> paths;
  for (uint32_t i = 0; i < count; i++) {
    napi_value item;
    std::string path;
    napi_get_element(env, argv[1], i, &item);
    if (!GetString(env, item, &path)) return Throw(env, "paths must be strings");
    paths.push_back(path);
  }

  DroperDragSource* source = [DroperDragSource new];
  napi_value resourceName;
  napi_create_string_utf8(env, "droper.dragEnd", NAPI_AUTO_LENGTH, &resourceName);
  napi_threadsafe_function tsfn;
  if (napi_create_threadsafe_function(env, argv[2], nullptr, resourceName, 0, 1, nullptr, nullptr, nullptr, CallJs, &tsfn) != napi_ok) {
    return Throw(env, "could not create callback");
  }
  source.tsfn = tsfn;

  NSPoint mouse = [view convertPoint:window.mouseLocationOutsideOfEventStream fromView:nil];
  NSMutableArray<NSDraggingItem*>* items = [NSMutableArray array];
  for (size_t i = 0; i < paths.size(); i++) {
    NSString* path = [NSString stringWithUTF8String:paths[i].c_str()];
    if (path == nil) continue;  // invalid UTF-8; fileURLWithPath:nil would throw
    NSURL* url = [NSURL fileURLWithPath:path];
    NSDraggingItem* item = [[NSDraggingItem alloc] initWithPasteboardWriter:url];
    NSImage* icon = [[NSWorkspace sharedWorkspace] iconForFile:path];
    CGFloat size = 64, offset = MIN(i, 4) * 6.0;
    [item setDraggingFrame:NSMakeRect(mouse.x - size / 2 + offset, mouse.y - size / 2 - offset, size, size) contents:icon];
    [items addObject:item];
  }

  // A drag must start from a mouse event; synthesize one if the current event isn't (we're inside an IPC handler).
  NSEvent* event = NSApp.currentEvent;
  if (event == nil || (event.type != NSEventTypeLeftMouseDown && event.type != NSEventTypeLeftMouseDragged)) {
    event = [NSEvent mouseEventWithType:NSEventTypeLeftMouseDragged
                               location:window.mouseLocationOutsideOfEventStream
                          modifierFlags:0
                              timestamp:NSProcessInfo.processInfo.systemUptime
                           windowNumber:window.windowNumber
                                context:nil
                            eventNumber:0
                             clickCount:1
                               pressure:1.0];
  }

  if (items.count == 0) {
    napi_release_threadsafe_function(tsfn, napi_tsfn_abort);
    return Throw(env, "no valid paths");
  }
  if (gActiveSources == nil) gActiveSources = [NSMutableSet set];
  [gActiveSources addObject:source];
  NSDraggingSession* session = [view beginDraggingSessionWithItems:items event:event source:source];
  if (session == nil) {
    napi_release_threadsafe_function(tsfn, napi_tsfn_abort);
    [gActiveSources removeObject:source];
  } else {
    session.animatesToStartingPositionsOnCancelOrFail = YES;
    session.draggingFormation = NSDraggingFormationStack;
  }

  napi_value ok;
  napi_get_boolean(env, session != nil, &ok);
  return ok;
}

static void SetString(napi_env env, napi_value obj, const char* key, NSString* value) {
  napi_value v;
  napi_create_string_utf8(env, value ? value.UTF8String : "", NAPI_AUTO_LENGTH, &v);
  napi_set_named_property(env, obj, key, v);
}

// appAtPoint(x, y): { id, name, exe } | null — owner of the frontmost normal window under a screen
// point (Electron/CG coordinates, top-left origin). Uses only window bounds and owner PIDs, which
// need no Screen Recording permission.
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
  CFArrayRef windows = CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements, kCGNullWindowID);
  if (!windows) return result;
  pid_t ownPid = NSProcessInfo.processInfo.processIdentifier;
  for (NSDictionary* w in (__bridge NSArray*)windows) {  // front to back
    if ([w[(id)kCGWindowLayer] intValue] != 0) continue;
    CGRect bounds;
    if (!CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)w[(id)kCGWindowBounds], &bounds)) continue;
    if (!CGRectContainsPoint(bounds, CGPointMake(x, y))) continue;
    pid_t pid = [w[(id)kCGWindowOwnerPID] intValue];
    if (pid == ownPid) break;
    NSRunningApplication* app = [NSRunningApplication runningApplicationWithProcessIdentifier:pid];
    if (!app) break;
    napi_create_object(env, &result);
    SetString(env, result, "id", app.bundleIdentifier);
    SetString(env, result, "name", app.localizedName);
    SetString(env, result, "exe", app.executableURL.lastPathComponent);
    break;
  }
  CFRelease(windows);
  return result;
}

// pasteboardCounts(): [dragChangeCount, generalChangeCount]. The drag pasteboard changes whenever
// any app starts a real drag session; the general one on every copy.
static napi_value PasteboardCounts(napi_env env, napi_callback_info) {
  static NSPasteboard* drag = [NSPasteboard pasteboardWithName:NSPasteboardNameDrag];
  napi_value result, d, g;
  napi_create_array_with_length(env, 2, &result);
  napi_create_int64(env, drag.changeCount, &d);
  napi_create_int64(env, NSPasteboard.generalPasteboard.changeCount, &g);
  napi_set_element(env, result, 0, d);
  napi_set_element(env, result, 1, g);
  return result;
}

static napi_value Init(napi_env env, napi_value exports) {
  napi_value fn;
  napi_create_function(env, "pasteboardCounts", NAPI_AUTO_LENGTH, PasteboardCounts, nullptr, &fn);
  napi_set_named_property(env, exports, "pasteboardCounts", fn);
  napi_create_function(env, "startDrag", NAPI_AUTO_LENGTH, StartDrag, nullptr, &fn);
  napi_set_named_property(env, exports, "startDrag", fn);
  napi_create_function(env, "appAtPoint", NAPI_AUTO_LENGTH, AppAtPoint, nullptr, &fn);
  napi_set_named_property(env, exports, "appAtPoint", fn);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
