(function () {
	"use strict";
	if (location.pathname !== "/events") return;

	document.addEventListener("DOMContentLoaded", function () {
		if (!window.FormUrlDraft) return;
		var form = document.getElementById("eventForm");
		if (!form) return;

		var api = window.FormUrlDraft.bind(
			"eventsDraft",
			function getState() {
				return {
					eventName: document.getElementById("eventName").value,
					hostName: document.getElementById("hostName").value,
					airport: document.getElementById("airport").value,
					map: document.getElementById("map").value,
					timezone: document.getElementById("timezone").value,
					duration: document.getElementById("duration").value,
					startTime: document.getElementById("startTime").value,
					endTime: document.getElementById("endTime").value,
					pilots: document.getElementById("pilots").value,
					description: document.getElementById("description").value,
					alertServer: document.getElementById("alertServer").checked
				};
			},
			function applyState(s) {
				if (!s || typeof s !== "object") return;
				function set(id, v) {
					var el = document.getElementById(id);
					if (el && v != null) el.value = v;
				}
				set("eventName", s.eventName);
				set("hostName", s.hostName);
				set("airport", s.airport);
				set("map", s.map);
				set("timezone", s.timezone);
				set("duration", s.duration);
				set("startTime", s.startTime);
				set("endTime", s.endTime);
				set("pilots", s.pilots);
				set("description", s.description);
				var cb = document.getElementById("alertServer");
				if (cb) cb.checked = !!s.alertServer;
			},
			form
		);

		var origFetch = window.fetch;
		window.fetch = function (input, init) {
			var url = typeof input === "string" ? input : input && input.url;
			return origFetch.apply(this, arguments).then(function (res) {
				try {
					if (url && String(url).indexOf("/api/events/create") !== -1 && res.ok && api && api.clearDraft) {
						api.clearDraft();
					}
				} catch (_) {}
				return res;
			});
		};
	});
})();
