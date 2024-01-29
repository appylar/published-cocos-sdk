# Appylar Cocos Creator

Appylar Cocos is a lightweight and easy-to-use Ad integration SDK, provided by Appylar.

Appylar provides several types of Ads, enabling you to set Ads wherever you want in the Cocos application. The Ads provided by Appylar are following:
- Banners
- Interstitials

## General Requirements

The targeted Cocos Creator version must be Cocos Creator 3.7.3 or later.

# Usage

The installation guide will lead you through the following steps:
- Download and install Cocos Creator: https://www.cocos.com/en/creator-download.
- Create a new Application or you can use an existing one if you have one.
- Click on [Download Appylar Script](https://github.com/rohit-5ex/cocos-final/blob/master/assets/Appylar.ts) to download the script and place the file in the assets folder.

## Step 1: Add Appylar reference in the project

- When you are done placing the `Appylar.ts` file in the assets folder, you need to import the class reference before use.
```ts
import { Appylar } from "./Appylar";
```

## Step 2: Callback functions.

There are 3 types of callbacks available in the Appylar SDK.

### AppylarInitializationListener: Responsible for handling global initialization callbacks.

- `onInitialized()`
- `onError(message: string)`

### AppylarBannerListener: Responsible for handling banner-related callbacks.

- `onBannerShown(height: number)`
- `onNoBanner()`

### AppylarInterstitialListener: Responsible for handling interstitial-related callbacks

- `onInterstitialShown()`
- `onInterstitialClosed()`
- `onNoInterstitial()`

### Complete code after implementing all callback function in single class:

```ts
import {
    _decorator,
    Component,
} from "cc";

const { ccclass } = _decorator;
import { Appylar } from "./Appylar";

@ccclass('SampleScript')
export class SampleScript extends Component implements AppylarInitializationListener, AppylarBannerListener, AppylarInterstitialListener {
    private appylar: Appylar;

    onInitialized(): void {
        //Callback for successful initialization
    }

    onError(message: string): void {
        //Callback for error thrown by SDK
    }

    onBannerShown(height: number): void {
        //Callback for Banner is shown success
    }

    onNoBanner(): void {
        // Callback if there are no banners available to show
    }

    onInterstitialShown() : void {
        //Callback for interstitial shown success
    }

    onInterstitialClosed() : void {
        //Callback for the close event of interstitial
    }

    onNoInterstitial() : void {
        //Callback if there are no interstitials available to show
    }
}
```
## Step 3: Initialize SDK

Initialize the sdk with desired configurations and attach initialization listener.

```ts
const configKeys: any = {
  appKeyIos: "<YOUR_IOS_APP_KEY>", 	//iOS APP KEY provide by console for Development use ["OwDmESooYtY2kNPotIuhiQ"]
  appKeyAndroid: "<YOUR_ANDROID_APP_KEY>",  //Android APP KEY provide by console for Development use ["jrctNFE1b-7IqHPShB-gKw"]
  appIdIos: "<YOUR_IOS_APP_IDENTIFIER>",  //iOS APP identifier
  appIdAndroid: "<YOUR_ANDROID_APP_PACKAGE_NAME>"  //Android App package name
};

const adTypes: AdType[] = ['banner', 'interstitial'];  //Define desired Ad types according to the app requirement
this.appylar = new Appylar(this.node)

appylar.init(
  this.configKeys,  //Supply config object
  adTypes,  //Supply AdTypes array
  true, //Test Mode, [TRUE] for development & [FALSE] for production
  this  //Reference of class where callback functions of AppylarInitializationListener are implemented
);
```

## Step 4: Add canShowAd check before showing Ad directly to the application

You can check the availability of the Ads for both banner and interstitial Ad types

```ts
const adType = "<DESIRED_AD_TYPE>"; //banner|interstitial
if (appylar.canShowAd(adType)) {
    //Desired Ad is available in SDK buffer
}
```

## Step 5: Implement Banner Ads.

You need to add 2 nodes for banners on the canvas and the names of the nodes are following
- For Top Banner: `topAdAppylar`
- For Bottom Banner: `bottomAdAppylar`

### Show the banner according to position

```ts
"<PLACEMENT_STRING>"); //Placement string is an optional parameter
appylar.showBanner(
  BannerPosition.top, // Values : BannerPosition.top|BannerPosition.bottom
  this, //Reference of class where callback functions of AppylarBannerListener are implemented
  "<PLACEMENT_STRING>", //Leave blank if not applicable
);
```

## Step 6: For hiding the banner at the run time..

```ts
appylar.hideBanner();
```

## Step 7: Add Interstitial to the application

You need to add another node for interstitial on the canvas and the name of the node should be `interstitialAdAppylar`.

### Show the intersitial with below function

```ts
appylar.showInterstitial(
  this //Reference of class where callback functions of AppylarInterstitialListener are implemented
  "<PLACEMENT_STRING>", //Leave blank if not applicable
);
```

## Step 7: Customize buffer Ads with `setParameters`

```ts
const parameters: Map<string, string[]> = new Map<string, string[]>()
parameters['banner_height'] = ["50"];
parameters['age_restriction'] = ["18"];
appylar.setParameter(parameters);
```

## Step 8: Build configurations for Android

Whenever generating a build for an Android you have to make changes in below files

### manifest.xml
You need to change the value of `screenOrientation` property inside activity tag, Values are following:
- If your application only supports `landscape` then the value will be `sensorLandscape`:
```
screenOrientation="sensorLandscape"
```
- If your application only supports `portrait` then the value will be `sensorPortrait`:
```
screenOrientation="sensorPortrait"
```
- If your application supports both orientations then the value will be `sensor`:
```
screenOrientation="sensor"
```

### AppActivity.java
You need to add 2 function in generated activity to provide support for Appylar
- After building out the Android package, modify the code in the AppActivity.java file to add the setOrientation and function. The function code is as follows:

 ## Step 9: To integrate the set orientation Function and get the density Function.
 - After building out the Android package, modify the code in the AppActivity.java file to add the setOrientation function. The function code is as follows:

```java
public static void setOrientation(String dir) {
  if (dir.equals("portrait"))
    GlobalObject.getActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT);
  else if (dir.equals("landscape"))
    GlobalObject.getActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
  else
    GlobalObject.getActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR);
}

public static float getDensity(String dir) {
  float d = Resources.getSystem().getDisplayMetrics().density;
  return d;
}
```
## Step 9: Build configurations for iOS

Whenever generating a build for an iOS you have to make changes in below files

### Appdelegate.m

Add below functions inside the file
```objc
+ (void)setOrientation:(NSString *)dir {
    currentOrientationM = dir;
    [UIViewController attemptRotationToDeviceOrientation];
}

-(UIInterfaceOrientationMask) application:(UIApplication )application supportedInterfaceOrientationsForWindow:(UIWindow )window
{
    if ([currentOrientationM isEqualToString:@"portrait"]) {
        return UIInterfaceOrientationMaskPortrait;
    } else if ([currentOrientationM isEqualToString:@"landscape"]) {
        return UIInterfaceOrientationMaskLandscape;
    } else {
        return UIInterfaceOrientationMaskAll;
    }
}
```
