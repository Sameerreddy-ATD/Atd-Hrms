#!/usr/bin/env python3
"""Null-guard Capacitor Bridge.getPermissionStates (Samsung Android 16 NPE)."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BRIDGE = (
    ROOT
    / "node_modules"
    / "@capacitor"
    / "android"
    / "capacitor"
    / "src"
    / "main"
    / "java"
    / "com"
    / "getcapacitor"
    / "Bridge.java"
)

MARKER = "Samsung One UI / Android 16"


def main() -> None:
    text = BRIDGE.read_text(encoding="utf-8")
    if MARKER in text:
        print("Bridge.java already patched")
        return
    old = """    protected Map<String, PermissionState> getPermissionStates(Plugin plugin) {
        Map<String, PermissionState> permissionsResults = new HashMap<>();
        CapacitorPlugin annotation = plugin.getPluginHandle().getPluginAnnotation();
"""
    new = """    protected Map<String, PermissionState> getPermissionStates(Plugin plugin) {
        Map<String, PermissionState> permissionsResults = new HashMap<>();
        // Samsung One UI / Android 16: plugin handle or annotation can be null during
        // WebView permission calls and used to NPE the whole process.
        if (plugin == null || plugin.getPluginHandle() == null) {
            return permissionsResults;
        }
        CapacitorPlugin annotation = plugin.getPluginHandle().getPluginAnnotation();
        if (annotation == null || annotation.permissions() == null) {
            return permissionsResults;
        }
        android.content.Context context = this.getContext();
        if (context == null) {
            return permissionsResults;
        }
"""
    if old not in text:
        raise SystemExit(f"Could not find getPermissionStates header in {BRIDGE}")
    text = text.replace(old, new, 1)
    text = text.replace(
        "ActivityCompat.checkSelfPermission(this.getContext(), permString)",
        "ActivityCompat.checkSelfPermission(context, permString)",
        1,
    )
    text = text.replace(
        "SharedPreferences prefs = getContext().getSharedPreferences(PERMISSION_PREFS_NAME, Activity.MODE_PRIVATE);",
        "SharedPreferences prefs = context.getSharedPreferences(PERMISSION_PREFS_NAME, Activity.MODE_PRIVATE);",
        1,
    )
    BRIDGE.write_text(text, encoding="utf-8")
    print("Patched", BRIDGE)


if __name__ == "__main__":
    main()
