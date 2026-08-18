package com.anytimediesel.workforce;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.graphics.Color;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.util.DisplayMetrics;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.WebView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.OnApplyWindowInsetsListener;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

/**
 * Keep startup close to stock Capacitor, with Samsung / OEM hardenings:
 * 1) Accept + flush WebView cookies so HTTP-only session cookies survive process
 *    death (otherwise login works, then a crash/restart asks for login again).
 * 2) Do not pad the WebView with system-bar insets. The web shell positions its
 *    own chrome, so instead of padding we publish the real system-bar insets as
 *    CSS variables — Chromium only derives env(safe-area-inset-*) from a display
 *    cutout, so a notchless phone would otherwise report zero while drawing
 *    edge-to-edge and put the header under the status icons.
 *    Listen on the decor/content root as well as the WebView — Samsung One UI
 *    often delivers WindowInsets to the decor view first and the WebView alone
 *    can stay at 0 (S25 Ultra / edge-to-edge).
 * 3) Request POST_NOTIFICATIONS directly. Capacitor's permission path runs
 *    through Bridge.getPermissionStates, which NPEs on some Samsung builds.
 */
public class MainActivity extends BridgeActivity {
    private static final int NOTIFICATION_PERMISSION_REQUEST = 4711;

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
            // Own the window edge-to-edge and report insets to the web layer.
            // Toggling decor fitting here as well would race the StatusBar
            // plugin, which sets it to false when it enables overlay mode.
            WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
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
        publishSystemBarInsets();
        // Bridge / StatusBar overlay can attach after onCreate — republish once
        // the first layout pass has real bars (critical on Samsung One UI 7).
        try {
            View content = findViewById(android.R.id.content);
            if (content != null) {
                content.post(this::publishSystemBarInsets);
                content.postDelayed(this::publishSystemBarInsets, 400);
                content.postDelayed(this::publishSystemBarInsets, 1200);
            }
        } catch (Exception ignored) {
            // Never block launch.
        }
        requestNotificationPermission();
        ensureNotificationChannel();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            publishSystemBarInsets();
        }
    }

    /** Mirrors the real system-bar insets into CSS custom properties. */
    private void publishSystemBarInsets() {
        try {
            final WebView webView = getBridge() != null ? getBridge().getWebView() : null;
            View content = findViewById(android.R.id.content);
            View decor = getWindow() != null ? getWindow().getDecorView() : null;

            OnApplyWindowInsetsListener listener = (view, insets) -> {
                applyInsetsToWeb(webView, insets);
                return insets;
            };

            // Decor + content receive insets even when the WebView child does not
            // (Samsung One UI edge-to-edge). Still listen on the WebView itself.
            if (decor != null) {
                ViewCompat.setOnApplyWindowInsetsListener(decor, (view, insets) -> {
                    applyInsetsToWeb(webView, insets);
                    return insets;
                });
                ViewCompat.requestApplyInsets(decor);
            }
            if (content != null && content != decor) {
                ViewCompat.setOnApplyWindowInsetsListener(content, listener);
                ViewCompat.requestApplyInsets(content);
            }
            if (webView != null) {
                ViewCompat.setOnApplyWindowInsetsListener(webView, (view, insets) -> {
                    applyInsetsToWeb(webView, insets);
                    return insets;
                });
                ViewCompat.requestApplyInsets(webView);
                // If the WebView already has insets from a prior pass, push them now.
                WindowInsetsCompat existing = ViewCompat.getRootWindowInsets(webView);
                if (existing != null) {
                    applyInsetsToWeb(webView, existing);
                }
            } else if (decor != null) {
                WindowInsetsCompat existing = ViewCompat.getRootWindowInsets(decor);
                if (existing != null) {
                    applyInsetsToWeb(null, existing);
                }
            }
        } catch (Exception ignored) {
            // Never block launch.
        }
    }

    private void applyInsetsToWeb(WebView webView, WindowInsetsCompat insets) {
        try {
            Insets bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );
            DisplayMetrics metrics = getResources().getDisplayMetrics();
            float density = metrics.density <= 0 ? 1f : metrics.density;
            final String script = String.format(
                java.util.Locale.US,
                "(function(){var s=document.documentElement.style;"
                    + "s.setProperty('--atd-inset-top','%.2fpx');"
                    + "s.setProperty('--atd-inset-bottom','%.2fpx');"
                    + "s.setProperty('--atd-inset-left','%.2fpx');"
                    + "s.setProperty('--atd-inset-right','%.2fpx');"
                    + "document.documentElement.classList.add('atd-native');})();",
                bars.top / density,
                bars.bottom / density,
                bars.left / density,
                bars.right / density
            );
            WebView target = webView;
            if (target == null && getBridge() != null) {
                target = getBridge().getWebView();
            }
            if (target == null) return;
            final WebView injectTarget = target;
            injectTarget.post(() -> {
                try {
                    injectTarget.evaluateJavascript(script, null);
                } catch (Exception ignored) {
                    // WebView may be tearing down.
                }
            });
        } catch (Exception ignored) {
            // Never block layout.
        }
    }

    /**
     * Android 13+ needs a runtime grant before any notification is shown. FCM
     * registration itself works without it, so a denial costs the banner, not
     * the token.
     */
    private void requestNotificationPermission() {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return;
            boolean granted = ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED;
            if (granted) return;
            ActivityCompat.requestPermissions(
                this,
                new String[] { Manifest.permission.POST_NOTIFICATIONS },
                NOTIFICATION_PERMISSION_REQUEST
            );
        } catch (Exception ignored) {
            // A refused or unavailable prompt must never block launch.
        }
    }

    /** Heads-up channel used by FCM so Play Store banners use the brand icon and colour. */
    private void ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        try {
            NotificationChannel channel = new NotificationChannel(
                "anytime_workforce",
                "Anytime Workforce",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Leave, attendance, and company alerts for your role.");
            channel.enableVibration(true);
            channel.enableLights(true);
            channel.setLightColor(Color.parseColor("#DC2F20"));
            channel.setShowBadge(true);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        } catch (Exception ignored) {
            // Channel creation must never block launch.
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
