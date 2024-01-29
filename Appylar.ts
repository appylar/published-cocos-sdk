import { _decorator, WebView, UITransform, view, sys, v2, game, Game, macro,native, screen, Node } from 'cc';

export interface AppylarBannerListener {
    onNoBanner(): void;
    onBannerShown(height: number): void;
}

export interface AppylarInterstitialListener {
    onNoInterstitial(): void;
    onInterstitialShown(): void;
    onInterstitialClosed(): void;
}

export interface AppylarInitializationListener {
    onInitialized(): void;
    onError(error: string): void;
}

export type BannerPosition = 'top' | 'bottom';
export type AdType = 'banner' | 'interstitial';
export type Orientation = 'landscape' | 'portrait';

interface CreateSessionRequestData {
    app_key: string;
    app_id: string;
    width: number;
    height: number;
    density: number;
    language: string;
    test_mode: boolean;
    orientations: string[];
}

type Ad = {
    ad: {
        height: number;
        id: number;
        orientation: Orientation;
        scale: number;
        type: AdType;
        width: number;
    };
    expires_at: string;
    html: string;
    url: string;
};

type ContentResponseData = {
    result: Ad[];
};

type ConfigKeys = {
    appKeyIos?: string;
    appIdIos?: string;
    appKeyAndroid?: string;
    appIdAndroid?: string;
};

type SessionResponseData = {
    buffer_limits: {
        min: number;
    };
    rotation_interval: number;
    session_token: string;
};

export class Appylar {

    private APP_VERSION = "1.0.0";
    // Constants for the API url's for appylar.
    private API_URL_CREATE_SESSION: string = `https://www.appylar.com/api/v1/session/`;
    private API_URL_CONTENT: string = `https://www.appylar.com/api/v1/content/`;

    // Create instances for the ad nodes.
    private topAdNode: Node;
    private bottomAdNode: Node;
    private interstitialAdNode: Node;
    // Reference for the main node.

    // private node: any = null;
    private canvas: Node;
    // Created the sessionContainerData instance for the buffer ads and data.
    private sessionContainerData: SessionResponseData;
    private adsContainerData: ContentResponseData = { result: [] };
    private timerForTopAd: number;
    private timerForBottomAd: number;
    private commonFlagForPurgeExpireAd: number = 0;
    private flagForTopAd: number = 0;
    private flagForBottomAd: number = 0;
    private flagForInterstitialAd: number = 0;
    private isInitialized: boolean = false;
    private isShowingInterstitial: boolean = false;
    private appylarInitializationListener: AppylarInitializationListener;
    private appylarBannerListener: AppylarBannerListener;
    private appylarInterstitialListener: AppylarInterstitialListener;
    private savedParameter: Map<string, string[]> = new Map<string, string[]>();
    private savedAdType: AdType[] = [];
    private detectedDensity = (sys.os !== sys.OS.ANDROID) ? screen.devicePixelRatio : 3.5;
    private adTestMode: boolean = false;
    private appKey: string = null;
    private appId: string = null;
    private sessionAttemptSuccess: boolean = false;
    private REQUEST_WAIT_TIME: number = 30 * 1000;
    private checkAdsAndPurgedExpCommonTimer: number;
    private checkAdsAndPurgedExpCommonInterval: number = 30 * 1000;
    private deviceRotationCheckInterval: number;
    private placementText: string = "";
    private allAdOrientations: string[] = ["landscape", "portrait"];
    private adToBeShow: Ad;
    private restartTimerFlag: number = 0;
    private ERROR_CODES = {
        MISSING_APP_KEY: "MISSING_APP_KEY",
        MISSING_APP_ID: "MISSING_APP_ID",
        AD_TYPE_MISSING: "AD_TYPE_MISSING",
        INVALID_APP_KEY: "INVALID_APP_KEY"
    };
    private currentOrientation: string = 'portrait';

    constructor(node: Node) {
        this.topAdNode = node
            .getChildByName("topAdAppylar");
        this.bottomAdNode = node
            .getChildByName("bottomAdAppylar");
        this.interstitialAdNode = node
            .getChildByName("interstitialAdAppylar");
        this.canvas = node;
        game.on(Game.EVENT_HIDE, this.appGoesInBackground, this);
        game.on(Game.EVENT_SHOW, this.appReturnFromBackground, this);
    }

    private checkOrientation() {
        if (this.isShowingInterstitial) {
            let orientation: string;
            if (sys.os === sys.OS.ANDROID) {
                orientation = this.currentOrientation === 'landscape' ? 'landscape' : 'portrait';
                native.reflection.callStaticMethod('com/cocos/game/AppActivity', 'setOrientation', '(Ljava/lang/String;)V', orientation);
            } else if (sys.os === sys.OS.IOS) {
                orientation = this.currentOrientation === 'landscape' ? 'H' : 'V';
                native.reflection.callStaticMethod('AppDelegate', 'setOrientation:', orientation);
            }
            return false;
        } else {
            const canvasSize = view.getCanvasSize();
            let newOrientation: string;

            if (canvasSize.width < canvasSize.height) {
                newOrientation = 'portrait';
            } else if (canvasSize.width > canvasSize.height) {
                newOrientation = 'landscape';
            }

            if (newOrientation && this.currentOrientation !== newOrientation) {
                this.currentOrientation = newOrientation;

                if (this.flagForTopAd !== 0 || this.flagForBottomAd !== 0) {
                    this.reloadAds();
                }
            }
        }
    }

    private reloadAds() {
        const position = this.flagForTopAd === 1 ? 'top' : this.flagForBottomAd === 1 ? 'bottom' : '';
        const adNode = this.getAdNode(position);
        const windowSize = view.getVisibleSize();
        const screenHeight = this.adToBeShow.ad.height * this.detectedDensity;
        this.initializeAdNode(adNode, position, windowSize, screenHeight);
        this.renderAd(this[adNode], this.adToBeShow);
    }

    private getAppylarUserAgent = () => {
        let platform = sys.os === sys.OS.ANDROID ? 'android' : 'ios';
        return `appylar cocos ${platform}/${this.APP_VERSION}`;
    }

    private createSession = async () => {
        if (sys.os === sys.OS.ANDROID) {
            this.detectedDensity = native.reflection.callStaticMethod("com/cocos/game/AppActivity", "getDensity", "(Ljava/lang/String;)F", '');
            console.log("detectedDensity", this.detectedDensity);
        }
        try {
            const width = sys.os === sys.OS.ANDROID ? view.getFrameSize().width / this.detectedDensity : view.getFrameSize().width;
            const height = sys.os === sys.OS.ANDROID ? view.getFrameSize().height / this.detectedDensity : view.getFrameSize().height;

            const payload: CreateSessionRequestData = {
                width,
                density: this.detectedDensity,
                height,
                language: sys.language,
                app_key: this.appKey,
                app_id: this.appId,
                test_mode: this.adTestMode,
                orientations: this.allAdOrientations
            };

            const url = this.API_URL_CREATE_SESSION;
            console.log("Payload for session API:", JSON.stringify(payload));
            const responseInit = await fetch(url, {
                method: "POST",
                body: JSON.stringify(payload),
                headers: {
                    "Appylar-User-Agent": this.getAppylarUserAgent(),
                    "Content-Type": "application/json"
                }
            });
            const responseInitJSON = await responseInit.json();
            console.log("Response for session API:", JSON.stringify(responseInitJSON));

            if (responseInit.status === 200) {
                this.sessionContainerData = responseInitJSON;
                if (!this.isInitialized || !this.sessionAttemptSuccess) {
                    this.appylarInitializationListener.onInitialized();
                }
                await this.requestAds({
                    portrait: this.savedAdType,
                    landscape: this.savedAdType,
                });

                this.checkAdsAndPurgedExpCommonTimer = setInterval(() => {
                    this.purgeExpiredAd();
                    this.checkAdsBuffer();
                }, this.checkAdsAndPurgedExpCommonInterval);
                this.commonFlagForPurgeExpireAd = 1;
                this.isInitialized = true;
                this.sessionAttemptSuccess = true;
            } else if (responseInit.status === 401 || responseInit.status === 403) {
                this.appylarInitializationListener.onError(JSON.stringify(responseInitJSON));
            } else if (responseInit.status === 500) {
                this.isInitialized = true;
                this.handleConditionFor500();
            } else {
                this.appylarInitializationListener.onError(JSON.stringify(responseInitJSON));
            }

        } catch (error) {
            if (error.message === 'Network request failed') {
                console.log("Timeout occurred, retrying the API request in 30 seconds.");
                this.isInitialized = true;
                setTimeout(() => {
                    console.log("Timeout timer completed, recalling the API.");
                    this.createSession();
                }, this.REQUEST_WAIT_TIME);
            } else {
                this.appylarInitializationListener.onError(error.message);
            }
        }
    };


    private getErrorMessage = (errorCode: string) => {
        const errorMessages = {
            [this.ERROR_CODES.MISSING_APP_KEY]: "You didn't provide the App Key",
            [this.ERROR_CODES.MISSING_APP_ID]: "You didn't provide the App ID",
            [this.ERROR_CODES.AD_TYPE_MISSING]: "You didn't provide the Ad Type",
            [this.ERROR_CODES.INVALID_APP_KEY]: "You didn't provide an valid App Key"
        };
        return errorMessages[errorCode];
    };

    private removeDuplicates = (adTypesInternal: any[]) => {
        return adTypesInternal.filter((item,
            index) => adTypesInternal.indexOf(item) === index);
    }

    private checkInternetForInit = async () => {
        if (sys.getNetworkType() == sys.NetworkType.LAN || sys.getNetworkType() == sys.NetworkType.WWAN) {
            await this.createSession();
        } else {
            console.log("Timer started for 30 sec, due to no internet availability.");
            setTimeout(() => {
                this.checkInternetForInit();
            }, this.REQUEST_WAIT_TIME); // Retry and check internet after 30 seconds
        }
    }

    private handleConditionFor500 = () => {
        setTimeout(() => {
            this.createSession();
        }, this.REQUEST_WAIT_TIME); // Retry after 30 seconds
    }

    private requestAds = async (combinations: Partial<Record<Orientation, AdType[]>>) => {
        try {
            const payload = JSON.stringify({
                extra_parameters: this.savedParameter,
                combinations,
            });
            console.log("Payload for request ads, ", payload);
            const url = this.API_URL_CONTENT;
            var myHeaders = new Headers();
            myHeaders.append("Appylar-User-Agent", this.getAppylarUserAgent());
            myHeaders.append("Authorization", `Bearer ${this.sessionContainerData.session_token}`);
            myHeaders.append("Content-Type", "application/json");
            console.log("headers for request ads, ", JSON.stringify(myHeaders));
            const responseAds = await fetch(url, {
                method: "POST",
                body: payload,
                headers: myHeaders
            });
            const responseAdsJSON = await responseAds.json();
            console.log("Response for request ads, ", JSON.stringify(responseAdsJSON))
            console.log("responseAds.status, ", responseAds.status)

            if (responseAds.status === 200) {
                const newContent = this.adsContainerData.result.concat(
                    responseAdsJSON.result
                );
                //this.sessionContainerData.session_token = 'abc' + this.sessionContainerData.session_token;
                this.adsContainerData.result = newContent;
                if (this.restartTimerFlag === 1) {
                    this.appReturnFromBackground();
                    this.restartTimerFlag = 0;
                }
            }
            else if (responseAds.status === 400) {

                this.appylarInitializationListener.onError(JSON.stringify(responseAdsJSON));
                // TODO stop all timers
                this.stopTimers();
                this.restartTimerFlag = 1;
            }
            else if (responseAds.status === 401) {
                // TODO manage session recreation with saved values
                // this.createSession();
                // clearTimeout(this.checkAdsAndPurgedExpCommonTimer)
                this.stopTimers();
                setTimeout(() => {
                    this.createSession();
                }, 30 * 1000)


            } else if (responseAds.status === 403) {
                // TODO stop all timers
                this.stopTimers();
                this.restartTimerFlag = 1;
                this.appylarInitializationListener.onError(JSON.stringify(responseAdsJSON));
            } else if (responseAds.status === 429) {
                console.log('rateLimitResponse', JSON.stringify(responseAdsJSON));
                if (responseAdsJSON.error === "err_rate_limited" && responseAdsJSON.wait) {
                    const waitTime = responseAdsJSON.wait;
                    setTimeout(() => {
                        this.requestAds(combinations);
                    }, waitTime * 1000)
                }
            }
        } catch (e) {
            console.log("error", JSON.stringify(e));
        }

    };

    private purgeExpiredAd = () => {
        // this block will remove after 19 & 20 test case verification.
        const adCountsBefore: { [key: string]: number } = {};
        const adCountsAfter: { [key: string]: number } = {};
        const savedAdType: any = this.savedAdType;
        this.allAdOrientations.forEach(orientation => {
            savedAdType.forEach((type) => {
                const key = `${orientation}-${type}`;
                adCountsBefore[key] = 0;
                adCountsAfter[key] = 0;
            });
        });

        // Count the ads by type and orientation
        for (const ad of this.adsContainerData.result) {
            const key = `${ad.ad.orientation}-${ad.ad.type}`;
            adCountsBefore[key] = (adCountsBefore[key] || 0) + 1;
        }
        console.log("before delete", JSON.stringify(adCountsBefore));
        // this block will remove after 19 & 20 test case verification.

        //this function will call every 30 seconds automatically from the init function the timer will start.
        const utcNow = new Date().toUTCString(); // Get current time in UTC
        this.adsContainerData.result.map((_val: any, index: number) => {
            const compareDateUTC = new Date(this.adsContainerData.result[index]['expires_at']).toUTCString();
            if (compareDateUTC <= utcNow) {
                this.adsContainerData.result.splice(index, 1);
            }
        });

        // this block will remove after 19 & 20 test case verification.
        for (const ad of this.adsContainerData.result) {
            const key = `${ad.ad.orientation}-${ad.ad.type}`;
            adCountsAfter[key] = (adCountsAfter[key] || 0) + 1;
        }
        console.log("after delete", JSON.stringify(adCountsAfter));
        // this block will remove after 19 & 20 test case verification.
        return true;
    }


    private checkAdsBuffer = () => {
        const adCounts: { [key: string]: number } = {};
        const savedAdType: any = this.savedAdType;
        this.allAdOrientations.forEach(orientation => {
            savedAdType.forEach((type) => {
                const key = `${orientation}-${type}`;
                adCounts[key] = 0;
            });
        });
        // Count the ads by type and orientation
        for (const ad of this.adsContainerData.result) {
            const key = `${ad.ad.orientation}-${ad.ad.type}`;
            adCounts[key] = (adCounts[key] || 0) + 1;
        }
        // Check if any type has fewer than buffer limit ads
        const fetchPayload: { [key: string]: string[] } = {};
        let shouldCallMoreAds = 0;
        for (const key in adCounts) {
            if (adCounts.hasOwnProperty(key) && adCounts[key] < this.sessionContainerData.buffer_limits.min) {
                const [orientation, type] = key.split('-');
                if (!fetchPayload[orientation]) {
                    fetchPayload[orientation] = [];
                }
                fetchPayload[orientation].push(type);
                shouldCallMoreAds = 1;
            }
        }
        if (shouldCallMoreAds === 1) {
            if (sys.getNetworkType() == sys.NetworkType.LAN || sys.getNetworkType() == sys.NetworkType.WWAN) {
                this.requestAds(fetchPayload);
                console.log(JSON.stringify(fetchPayload));
            } else {
                console.log("INTERNET UNAVAILABLE : for ", JSON.stringify(fetchPayload));
            }
        }
        return true;
    }

    private renderAd(elementToBeShown: Node, ad: Ad) {
        const node = elementToBeShown;
        const url = ad.url;
        const height = ad.ad.height;
        const myWebView = elementToBeShown.addComponent(WebView);

        if (sys.os === sys.OS.IOS) {
            this.setIOSWebViewDimensions(node, myWebView, height);
        } else if (sys.os === sys.OS.ANDROID) {
            this.setAndroidWebViewDimensions(myWebView, height);
        }

        myWebView.url = url;
        this.setupWebviewCallback(myWebView);
        this.setWebViewAnchorPoint(myWebView);
    }

    private setIOSWebViewDimensions(node: Node, myWebView: WebView, height: number) {
        if (this.currentOrientation === 'portrait') {
            node.height = height + (10 * this.detectedDensity);
        } else {
            node.height = height - (5 * this.detectedDensity);
        }
        this.setCommonWebViewDimensions(myWebView);
    }

    private setAndroidWebViewDimensions(myWebView: WebView, height: number) {
        myWebView.height = height;
        this.setCommonWebViewDimensions(myWebView);
    }

    private setCommonWebViewDimensions(myWebView: WebView) {
        myWebView.width = view.getVisibleSize().width / this.detectedDensity;
    }

    private setWebViewAnchorPoint(myWebView: WebView) {
        const uiTransform = myWebView.getComponent(UITransform);
        uiTransform.setAnchorPoint(0.5, 0.5);
    }

    private getAPIKeyByConfig(config: ConfigKeys) {
        const platform = sys.os === sys.OS.IOS ? 'Ios' : 'Android';

        return {
            appKey: config[`appKey${platform}`],
            appId: config[`appId${platform}`],
        };
    }

    private setupWebviewCallback(webviewComp: WebView) {
        const scheme = "appylar";

        const jsCallback = (target, url) => {
            const values = url.replace(scheme + '://', ''); // Remove the scheme and decode the URL

            if (values.includes('operation=redirect')) {
                this.handleRedirectOperation(values);
            } else if (values.includes('operation=close')) {
                this.handleCloseOperation();
            }
        };

        webviewComp.setJavascriptInterfaceScheme(scheme);
        webviewComp.setOnJSCallback(jsCallback);
    }

    private handleRedirectOperation(values: string) {
        const operationRemoved = values.replace('&operation=redirect', '');
        const redirectRemoved = operationRemoved.replace('redirect_url=', '');
        const decodedString = decodeURIComponent(redirectRemoved);
        sys.openURL(decodedString);
    }

    private handleCloseOperation() {
        this.appylarInterstitialListener.onInterstitialClosed();
        if (this.flagForTopAd === 1) {
            this.scheduleBannerRotation('top', this.appylarBannerListener);
        }

        if (this.flagForBottomAd === 1) {
            this.scheduleBannerRotation('bottom', this.appylarBannerListener);
        }
        this.hideInterstitial();
    }

    private scheduleBannerRotation(position: string, listener: AppylarBannerListener) {
        const timer = position === 'top' ? 'timerForTopAd' : 'timerForBottomAd';
        this[timer] = setTimeout(() => {
            this.showBannerAd(position, listener, 1);
        }, this.sessionContainerData.rotation_interval * 1000);
    }

    private stopTimers = () => {
        clearTimeout(this.timerForTopAd);
        clearTimeout(this.timerForBottomAd);
        clearInterval(this.checkAdsAndPurgedExpCommonTimer);
        this.flagForTopAd = 0;
        this.flagForBottomAd = 0;
        // this.commonFlagForPurgeExpireAd = 0;
    }

    private appGoesInBackground = () => {
        clearTimeout(this.timerForTopAd);
        clearTimeout(this.timerForBottomAd);
        clearInterval(this.checkAdsAndPurgedExpCommonTimer);
    }

    private appReturnFromBackground = () => {
        if (this.commonFlagForPurgeExpireAd === 1) {
            this.checkAdsAndPurgedExpCommonTimer = setInterval(() => {
                this.purgeExpiredAd();
                this.checkAdsBuffer();
            }, this.checkAdsAndPurgedExpCommonInterval); // call purgeExpiredAd every 30 seconds
        }

        // Restart banner rotation when the app returns from background
        if (this.flagForTopAd === 1) {
            this.timerForTopAd = setTimeout(() => {
                this.showBannerAd('top', this.appylarBannerListener, 1);
            }, this.sessionContainerData.rotation_interval * 1000);
        }

        if (this.flagForBottomAd === 1) {
            this.timerForBottomAd = setTimeout(() => {
                this.showBannerAd('bottom', this.appylarBannerListener, 1);
            }, this.sessionContainerData.rotation_interval * 1000);
        }
    }


    onDestroy() {
        game.off(Game.EVENT_HIDE, this.appGoesInBackground, this);
        game.off(Game.EVENT_SHOW, this.appReturnFromBackground, this);
    }

    private hideInterstitial = () => {
        const webviewNodeInterstitial = this.interstitialAdNode;
        const interstitialWebViews = webviewNodeInterstitial.getComponents(WebView);
        interstitialWebViews.forEach((webView: WebView) => {
            webView.destroy();
        });
        // this.isInterstitialShowing = false;
        this.isShowingInterstitial = false;
        this.flagForInterstitialAd = 0;
        if (sys.os === sys.OS.ANDROID) {
            native.reflection.callStaticMethod('com/cocos/game/AppActivity', 'setOrientation', '(Ljava/lang/String;)V', 'auto');
        } else if (sys.os === sys.OS.IOS) {
            native.reflection.callStaticMethod('AppDelegate', 'setOrientation:', '');
        }

        view.setOrientation(macro.ORIENTATION_AUTO);
    }

    private clearTimers = (position: string) => {
        clearTimeout(position === 'top' ? this.timerForTopAd : position === 'bottom' ? this.timerForBottomAd : null);
        const flagName = position === 'top' ? 'flagForTopAd' : position === 'bottom' ? 'flagForBottomAd' : null;
        this[flagName] = 0;
    }

    init = async (
        config: ConfigKeys,
        adType: AdType[],
        testMode: boolean,
        listeners: AppylarInitializationListener,
    ) => {
        if (this.isInitialized) {
            console.log("Init calling ignored.");
            return; // Return true to indicate success (already initialized)
        }
        try {
            const adTypeInternal = this.removeDuplicates(adType);
            const appConfig = this.getAPIKeyByConfig(config);
            this.appylarInitializationListener = listeners;

            if (!appConfig.appKey) {
                listeners.onError(this.getErrorMessage(this.ERROR_CODES.MISSING_APP_KEY));
                return;
            }

            if (!appConfig.appId) {
                listeners.onError(this.getErrorMessage(this.ERROR_CODES.MISSING_APP_ID));
                return;
            }

            if (!adTypeInternal || adTypeInternal.length == 0) {
                listeners.onError(this.getErrorMessage(this.ERROR_CODES.AD_TYPE_MISSING));
                return;
            }

            //Save values to settings
            this.savedAdType = adTypeInternal;
            this.appKey = appConfig.appKey;
            this.appId = appConfig.appId;
            this.adTestMode = testMode;

            // Initialize the SDK prevention flag
            this.isInitialized = true;
            this.deviceRotationCheckInterval = setInterval(() => {
                this.checkOrientation();
            }, 1000);
            if (sys.getNetworkType() == sys.NetworkType.LAN || sys.getNetworkType() == sys.NetworkType.WWAN) {
                await this.createSession();
            } else {
                await this.checkInternetForInit();
            }
            return;
        } catch (error) {
            listeners.onError(error.message);
            return;
        }
    };

    canShowAd = (adType: AdType): boolean => {
        //this will be called by the dev to check if ads are available in buffer.
        let count = 0;
        if (this.adsContainerData) {
            this.adsContainerData.result.map((val: any) => {
                count = ((val.ad.orientation === this.currentOrientation) && (val.ad.type === adType)) ? count + 1 : count;
            });
        }
        return count > 0 ? true : false;
    };


    showBanner = async (position: BannerPosition, listeners: AppylarBannerListener, placement: string) => {
        console.log((this.flagForTopAd !== 1 && position === 'top') || (this.flagForBottomAd !== 1 && position === 'bottom'))
        this.appylarBannerListener = listeners;
        const canShowAd = this.canShowAd("banner");

        if (!canShowAd) {
            this.appylarBannerListener.onNoBanner();
            return false;
        }
        if (this.flagForTopAd === 1 || this.flagForBottomAd === 1) {
            console.log("showBanner: IGNORED");
            return false;
        }
        this.placementText = placement;
        const isFromRotation = 0;
        await this.showBannerAd(position, listeners, isFromRotation);
    }

    private showBannerAd = async (position: string, listeners: AppylarBannerListener, isFromRotation: number) => {
        if (this.isShowingInterstitial) {
            return false;
        }
        //this.hideBanner();
        this.appylarBannerListener = listeners;

        const canShowAd = this.canShowAd("banner");

        if (!canShowAd) {
            this.scheduleBanner(position, listeners);
            return false;
        }

        this.adToBeShow = this.adsContainerData.result.find((val: any) => (
            val.ad.type === 'banner' && val.ad.orientation === this.currentOrientation
        ));

        const index = this.adsContainerData.result.indexOf(this.adToBeShow);

        if (index !== -1) {
            this.adsContainerData.result.splice(index, 1);

            const adNode = this.getAdNode(position);
            const flagName = this.getFlagName(position);
            const windowSize = view.getVisibleSize();
            console.log(windowSize, 'windowSize');
            const screenHeight = this.adToBeShow.ad.height * this.detectedDensity;
            this.initializeAdNode(adNode, position, windowSize, screenHeight);
            this[flagName] = 1;
            this.scheduleBanner(position, listeners);

            this.modifyHTMLContent(this.adToBeShow);

            this.renderAd(this[adNode], this.adToBeShow);
            if (isFromRotation === 0) {
                listeners.onBannerShown(this.adToBeShow.ad.height);
            }
        } else {
            this.scheduleBanner(position, listeners);
        }

        return true;
    };

    private getTimerName(position: string) {
        return position === 'top' ? 'timerForTopAd' : position === 'bottom' ? 'timerForBottomAd' : '';
    }

    private getAdNode(position: string) {
        return position === 'top' ? 'topAdNode' : position === 'bottom' ? 'bottomAdNode' : '';
    }

    private getFlagName(position: string) {
        return position === 'top' ? 'flagForTopAd' : position === 'bottom' ? 'flagForBottomAd' : '';
    }

    initializeAdNode(adNode: string, position: string, windowSize: any, screenHeight: number) {
        this[adNode].setAnchorPoint(v2(0.5, 0.5));
        this[adNode].setScale(this.detectedDensity * 1, this.detectedDensity * 1);
        const screenWidth = view.getVisibleSize().width;
        this[adNode].setContentSize(screenWidth / this.detectedDensity, screenHeight / this.detectedDensity);
        if (sys.os === sys.OS.IOS) {
            this[adNode].setPosition(0, position === 'top' ? ((windowSize.height - screenHeight) / this.detectedDensity) + ((this.currentOrientation === 'portrait') ? (-this.detectedDensity * 5) : (this.detectedDensity * 5)) : position === 'bottom' ? -(((windowSize.height - screenHeight) / this.detectedDensity) + ((this.currentOrientation === 'portrait') ? (-this.detectedDensity * 5) : (this.detectedDensity * 5))) : 0);
            this[adNode].getComponent(UITransform).setContentSize(windowSize.width / this.detectedDensity, screenHeight / ((this.currentOrientation === 'portrait') ? 1 : this.detectedDensity));
        } else if (sys.os === sys.OS.ANDROID) {
            const aspectFactor = (view.getScaleX() * this.detectedDensity);
            this[adNode].setPosition(0, position === 'top' ? (this.currentOrientation === 'portrait' ? ((windowSize.height + 10) / 2 - (screenHeight / 2)) : (windowSize.height / 2 - ((screenHeight / this.detectedDensity) / 2))) : - (this.currentOrientation === 'portrait' ? ((windowSize.height + 10) / 2 - (screenHeight / 2)) : (windowSize.height / 2 - ((screenHeight / this.detectedDensity) / 2))));
            // this[adNode].setPosition(0, position === 'top' ? (windowSize.height - screenHeight) / 2 + (this.currentOrientation === 'portrait' ? (aspectFactor * 2) : (aspectFactor * 6)) : position === 'bottom' ? -((windowSize.height - screenHeight) / 2 + (this.currentOrientation === 'portrait' ? (aspectFactor * 2) : (aspectFactor * 6))) : 0);
            this[adNode].setContentSize(windowSize.width / this.detectedDensity, screenHeight / (view.getScaleX() * this.detectedDensity));
        }
    }

    private modifyHTMLContent(adToBeShow: any) {
        let html = ` ${adToBeShow.html.toString()} `;
        console.log('Original HTML:', JSON.stringify(html));
        this.adToBeShow.html = html.replaceAll('%25PLACEMENT%25', encodeURIComponent(this.placementText)).replaceAll('%PLACEMENT%', encodeURIComponent(this.placementText));
        console.log('Modified HTML:', JSON.stringify(this.adToBeShow.html));
    }


    private scheduleBanner = (position: string, listeners: AppylarBannerListener) => {
        const timerName = position === 'top' ? 'timerForTopAd' : position === 'bottom' ? 'timerForBottomAd' : '';
        const isFromRotation = 1;
        this[timerName] = setTimeout(() => {
            this.showBannerAd(position, listeners, isFromRotation);
        }, this.sessionContainerData.rotation_interval * 1000);
    }

    showInterstitial = async (listeners: AppylarInterstitialListener, placement: string) => {
        //console.log(this.flagForTopAd !== 1 && position === 'top' || this.flagForBottomAd !== 1 && position === 'bottom');
        this.appylarInterstitialListener = listeners;
        const canShowAd = this.canShowAd("interstitial");

        if (!canShowAd) {
            listeners.onNoInterstitial();
            return;
        }

        if (this.flagForInterstitialAd === 1) {
            console.log("Already shown Interstitial.");
            return;
        }
        await this.showInterstitialAd(this.appylarInterstitialListener, placement);
    };
    private showInterstitialAd = async (listeners: AppylarInterstitialListener, placement: string) => {
        if (this.isShowingInterstitial) {
            console.log('Interstitial already shown.');
            return false;
        }

        //this.hideInterstitial();
        this.flagForInterstitialAd = 1;

        const isInterstitialAvailable = await this.canShowAd('interstitial');

        if (isInterstitialAvailable) {
            try {
                // Set the flag to indicate that the interstitial is being shown
                this.adToBeShow = this.adsContainerData.result.find(val => val.ad.type === 'interstitial' && val.ad.orientation === this.currentOrientation);
                const index = this.adsContainerData.result.indexOf(this.adToBeShow);
                listeners.onInterstitialShown();

                if (index !== -1) {
                    this.adsContainerData.result.splice(index, 1);
                }

                if (this.adToBeShow) {
                    // Get the screen size
                    const screenWidth = view.getVisibleSize().width;
                    const screenHeight = view.getVisibleSize().height;
                    this.isShowingInterstitial = true; // Create or get the WebView component

                    let interstitialWebView = this.interstitialAdNode.getComponent(WebView);

                    if (!interstitialWebView) {
                        interstitialWebView = this.interstitialAdNode.addComponent(WebView);
                    } // Set the WebView's position, size, and anchor point to cover the full screen


                    interstitialWebView.node.setAnchorPoint(v2(0.5, 0.5));
                    interstitialWebView.node.setContentSize(screenWidth / this.detectedDensity, screenHeight / this.detectedDensity);
                    interstitialWebView.node.setPosition(0, 0);
                    interstitialWebView.node.setScale(this.detectedDensity, this.detectedDensity); // Load the URL into the WebView

                    this.modifyHTMLContent(this.adToBeShow);
                    interstitialWebView.url = this.adToBeShow.url; // Handle WebView callbacks if needed
                    this.appylarInterstitialListener = listeners;
                    this.setupWebviewCallback(interstitialWebView);
                    this.checkOrientation(); // Set the orientation

                    clearTimeout(this.timerForTopAd);
                    clearTimeout(this.timerForBottomAd);
                } else {
                    listeners.onNoInterstitial();
                    this.flagForInterstitialAd = 0;
                }
            } catch (error) {
                listeners.onNoInterstitial();
                this.flagForInterstitialAd = 0;
            }
        } else {
            listeners.onNoInterstitial();
            this.flagForInterstitialAd = 0;
        }
    };

    setParameters = (parameter: Map<string, string[]> | null): void => {
        if (this.isInitialized === true) {
            Object.keys(parameter).forEach((key) => {
                if (this.savedParameter[key] !== undefined) {
                    if (parameter[key][0] === "") {
                        const tempObj = this.savedParameter;
                        delete (tempObj[key]);
                        this.savedParameter = tempObj;
                    }
                    else { this.savedParameter[key] = parameter[key]; }
                } else {
                    if (parameter[key][0] !== "") {
                        this.savedParameter[key] = parameter[key]
                    }
                }
            });
            this.adsContainerData.result = [];
            this.requestAds({
                portrait: this.savedAdType,
                landscape: this.savedAdType,
            });
        } else {
            console.log("Set parameter is ignored due to session is not created yet.")
        }
    };

    hideBanner = () => {
        this.destroyWebViews(this.topAdNode);
        this.destroyWebViews(this.bottomAdNode);
        this.clearTimers('top');
        this.clearTimers('bottom');
        this.placementText = "";
        console.log("Hide Banner Called");
        return true;

    };

    destroyWebViews = (node: Node) => {
        const webViews = node.getComponents(WebView);
        webViews.forEach((webView: WebView) => {
            webView.destroy();
        });
    };


    emptyBuffer() {
        console.log("Buffer CLEARED")
        this.adsContainerData.result = [];
    };
}