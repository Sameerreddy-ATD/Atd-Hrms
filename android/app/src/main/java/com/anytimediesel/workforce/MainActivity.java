package com.anytimediesel.workforce;

import com.getcapacitor.BridgeActivity;

/**
 * Keep startup as close to stock Capacitor as possible.
 * Aggressive edge-to-edge / cutout flags caused white status gaps and crashes on
 * some OEM devices; notch padding is handled in web CSS when needed.
 */
public class MainActivity extends BridgeActivity {}
