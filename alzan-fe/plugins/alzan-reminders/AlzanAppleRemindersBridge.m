#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(AlzanAppleReminders, NSObject)

RCT_EXTERN_METHOD(createReminders
                  : (NSDictionary *)options resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject)

@end
