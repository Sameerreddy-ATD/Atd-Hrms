package com.anytimediesel.workforce;

import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebView;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

/**
 * Keep startup close to stock Capacitor, with Samsung / OEM hardenings:
 * 1) Accept + flush WebView cookies so HTTP-only session cookies survive process
 *    death (otherwise login works, then a crash/restart asks for login again).
 * 2) Do not pad the WebView with system-bar insets. Android 16 already draws
 *    edge-to-edge; extra padding made the top chrome eat the screen. The web
 *    shell uses clamped safe-area insets so the header stays a compact bar
 *    under the status icons on every device.
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try {
            setTitle(R.string.app_name);
            if (getSupportActionBar() != null) {
                getSupportActionBar().hide();
            }
        } catch (Exception ignored) {
            // Never block launch.
        }
        try {
            // Prefer a normal content window when the OS still honors it (API 34/35).
            // API 36 ignores this and stays edge-to-edge — CSS safe-area handles that.
            WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        } catch (Exception ignored) {
            // Never block launch.
        }
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
