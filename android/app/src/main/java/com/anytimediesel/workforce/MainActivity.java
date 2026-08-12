package com.anytimediesel.workforce;

import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

/**
 * Keep startup close to stock Capacitor, with two Samsung / OEM hardenings:
 * 1) Accept + flush WebView cookies so HTTP-only session cookies survive process
 *    death (otherwise login works, then a crash/restart asks for login again).
 * 2) Avoid aggressive edge-to-edge / cutout flags that caused white status gaps.
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try {
            CookieManager cookies = CookieManager.getInstance();
            cookies.setAcceptCookie(true);
            WebView webView = getBridge() != null ? getBridge().getWebView() : null;
            if (webView != null) {
                cookies.setAcceptThirdPartyCookies(webView, true);
            }
        } catch (Exception ignored) {
            // CookieManager can throw on some OEM WebView builds; never block launch.
        }
    }

    @Override
    public void onPause() {
        try {
            CookieManager.getInstance().flush();
        } catch (Exception ignored) {
            // Best-effort cookie flush before the process may be killed.
        }
        super.onPause();
    }

    @Override
    public void onStop() {
        try {
            CookieManager.getInstance().flush();
        } catch (Exception ignored) {
            // Best-effort.
        }
        super.onStop();
    }
}
