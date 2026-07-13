// Single source of truth for the native app store listings.
//
// iOS is live as "HMU Pickup" (App Store id6774196068).
// Android is live as "HMU Cash Ride" (Google Play package com.hmucashride).
// The download UI hides any store whose URL is left empty, so a store can be
// pulled by blanking its constant here.
export const IOS_APP_STORE_URL = 'https://apps.apple.com/us/app/hmu-pickup/id6774196068';
export const GOOGLE_PLAY_URL = 'https://play.google.com/store/apps/details?id=com.hmucashride';

export const hasIosApp = IOS_APP_STORE_URL.length > 0;
export const hasAndroidApp = GOOGLE_PLAY_URL.length > 0;
export const hasAnyApp = hasIosApp || hasAndroidApp;
