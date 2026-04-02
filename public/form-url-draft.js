(function () {
	"use strict";
	if (typeof window === "undefined") return;

	var DEBOUNCE_MS = 450;

	function utf8ToBase64Url(str) {
		var bytes = new TextEncoder().encode(str);
		var bin = "";
		for (var i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
		return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
	}

	function base64UrlToUtf8(b64url) {
		var b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
		var pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
		var bin = atob(b64 + pad);
		var bytes = new Uint8Array(bin.length);
		for (var i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
		return new TextDecoder().decode(bytes);
	}

	function hashPrefix(prefix) {
		return "#" + prefix + "=";
	}

	window.FormUrlDraft = {
		debounceMs: DEBOUNCE_MS,
		utf8ToBase64Url: utf8ToBase64Url,
		base64UrlToUtf8: base64UrlToUtf8,
		bind: function (prefix, getState, applyState, root) {
			var fullPrefix = hashPrefix(prefix);
			var timer = null;

			function schedule() {
				clearTimeout(timer);
				timer = setTimeout(function () {
					try {
						var payload = utf8ToBase64Url(JSON.stringify(getState()));
						var next = location.pathname + location.search + fullPrefix + payload;
						if (location.pathname + location.search + location.hash !== next) {
							history.replaceState(null, "", next);
						}
					} catch (_) {}
				}, DEBOUNCE_MS);
			}

			function tryRestore() {
				var h = location.hash;
				if (!h.startsWith(fullPrefix)) return;
				try {
					var obj = JSON.parse(base64UrlToUtf8(h.slice(fullPrefix.length)));
					applyState(obj);
				} catch (_) {}
			}

			function clearDraft() {
				clearTimeout(timer);
				timer = null;
				if (location.hash.indexOf(fullPrefix) === 0) {
					history.replaceState(null, "", location.pathname + location.search);
				}
			}

			root = root || document;
			root.addEventListener("input", schedule, true);
			root.addEventListener("change", schedule, true);
			tryRestore();

			return { schedule: schedule, tryRestore: tryRestore, clearDraft: clearDraft };
		}
	};
})();
