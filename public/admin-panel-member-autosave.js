(function () {
	"use strict";

	var ADMIN_MS = 1000;
	var timer = null;
	var lastCommitted = null;
	var undoTimer = null;

	var origOpen = typeof openEditModal === "function" ? openEditModal : null;
	var origClose = typeof closeEditModal === "function" ? closeEditModal : null;
	var origSave = typeof saveChanges === "function" ? saveChanges : null;

	if (!origOpen || !origClose || !origSave) return;

	function readRolesFromDOM() {
		var els = document.querySelectorAll("#currentRoles .role-name");
		if (!els.length) return [];
		return Array.prototype.map
			.call(els, function (n) {
				return n.textContent.trim();
			})
			.filter(Boolean);
	}

	function snap() {
		return {
			flighthours: parseFloat(document.getElementById("flighthours").value),
			callsign: document.getElementById("callsign").value.trim().toUpperCase(),
			roles: readRolesFromDOM().slice().sort(),
		};
	}

	function equal(a, b) {
		if (!a || !b) return false;
		if (a.flighthours !== b.flighthours || (a.callsign || "") !== (b.callsign || "")) return false;
		if (a.roles.length !== b.roles.length) return false;
		for (var i = 0; i < a.roles.length; i += 1) {
			if (a.roles[i] !== b.roles[i]) return false;
		}
		return true;
	}

	function persistMember(memberId) {
		var flighthours = parseFloat(document.getElementById("flighthours").value);
		if (isNaN(flighthours) || flighthours < 0) {
			return Promise.reject(new Error("Flight hours must be valid"));
		}
		var callsignInput = document.getElementById("callsign").value.trim().toUpperCase();
		var member = allMembers.find(function (m) {
			return m._id === memberId;
		});
		if (!member) return Promise.reject(new Error("Member not found"));
		var originalRoles = member.Role || [];
		var targetRoles = readRolesFromDOM();
		var rolesToAdd = targetRoles.filter(function (r) {
			return originalRoles.indexOf(r) === -1;
		});
		var rolesToRemove = originalRoles.filter(function (r) {
			return targetRoles.indexOf(r) === -1;
		});
		var origCall = (member.Callsign || "").trim().toUpperCase();
		var promises = [
			fetch("/api/admin/users/" + memberId + "/updateFlighthours", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ flighthours: flighthours }),
			}).then(function (r) {
				if (!r.ok) throw new Error("Failed to update flight hours");
				return r.json();
			}),
		];
		if (callsignInput !== origCall && callsignInput.length > 0) {
			promises.push(
				fetch("/api/admin/users/" + memberId + "/updateCallsign", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ callsign: callsignInput }),
				}).then(function (r) {
					if (!r.ok) throw new Error("Failed to update callsign");
					return r.json();
				})
			);
		}
		rolesToAdd.forEach(function (role) {
			promises.push(
				fetch("/api/admin/users/" + memberId + "/updateRole", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ role: role }),
				}).then(function (r) {
					if (!r.ok) throw new Error("Failed to add role: " + role);
					return r.json();
				})
			);
		});
		rolesToRemove.forEach(function (role) {
			promises.push(
				fetch("/api/admin/users/" + memberId + "/removeRole", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ role: role }),
				}).then(function (r) {
					if (!r.ok) throw new Error("Failed to remove role: " + role);
					return r.json();
				})
			);
		});
		return Promise.all(promises);
	}

	function patchLocal(memberId) {
		var m = allMembers.find(function (x) {
			return x._id === memberId;
		});
		if (!m) return;
		m.Flighthours = parseFloat(document.getElementById("flighthours").value);
		var cs = document.getElementById("callsign").value.trim().toUpperCase();
		if (cs) m.Callsign = cs;
		m.Role = readRolesFromDOM();
	}

	function scheduleAutosave() {
		if (!currentEditingMemberId) return;
		clearTimeout(timer);
		timer = setTimeout(function () {
			timer = null;
			if (!currentEditingMemberId) return;
			var cur = snap();
			if (isNaN(cur.flighthours) || cur.flighthours < 0) return;
			if (!lastCommitted || equal(cur, lastCommitted)) return;
			persistMember(currentEditingMemberId)
				.then(function () {
					patchLocal(currentEditingMemberId);
					lastCommitted = snap();
				})
				.catch(function (err) {
					var el = document.getElementById("errorMessage");
					if (el) {
						el.textContent = err.message;
						el.classList.add("show");
					}
				});
		}, ADMIN_MS);
	}

	function hideUndo() {
		var toast = document.getElementById("adminUndoToast");
		if (toast) toast.hidden = true;
		clearTimeout(undoTimer);
	}

	function showUndo(memberId, revert) {
		var toast = document.getElementById("adminUndoToast");
		if (!toast) return;
		toast.hidden = false;
		clearTimeout(undoTimer);
		undoTimer = setTimeout(hideUndo, 10000);
		var btn = document.getElementById("adminUndoBtn");
		if (btn) {
			btn.onclick = function () {
				revertMember(memberId, revert)
					.then(function () {
						hideUndo();
						loadMembers();
					})
					.catch(function (e) {
						var el = document.getElementById("errorMessage");
						if (el) {
							el.textContent = e.message;
							el.classList.add("show");
						}
					});
			};
		}
	}

	function revertMember(memberId, target) {
		var member = allMembers.find(function (m) {
			return m._id === memberId;
		});
		if (!member) return Promise.reject(new Error("Member not found"));
		var curRoles = member.Role || [];
		var rolesToAdd = target.roles.filter(function (r) {
			return curRoles.indexOf(r) === -1;
		});
		var rolesToRemove = curRoles.filter(function (r) {
			return target.roles.indexOf(r) === -1;
		});
		var promises = [
			fetch("/api/admin/users/" + memberId + "/updateFlighthours", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ flighthours: target.flighthours }),
			}).then(function (r) {
				if (!r.ok) throw new Error("Failed to undo flight hours");
				return r.json();
			}),
		];
		if (target.callsign && target.callsign.length > 0) {
			promises.push(
				fetch("/api/admin/users/" + memberId + "/updateCallsign", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ callsign: target.callsign }),
				}).then(function (r) {
					if (!r.ok) throw new Error("Failed to undo callsign");
					return r.json();
				})
			);
		}
		rolesToAdd.forEach(function (role) {
			promises.push(
				fetch("/api/admin/users/" + memberId + "/updateRole", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ role: role }),
				}).then(function (r) {
					if (!r.ok) throw new Error("Failed to add role");
					return r.json();
				})
			);
		});
		rolesToRemove.forEach(function (role) {
			promises.push(
				fetch("/api/admin/users/" + memberId + "/removeRole", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ role: role }),
				}).then(function (r) {
					if (!r.ok) throw new Error("Failed to remove role");
					return r.json();
				})
			);
		});
		return Promise.all(promises);
	}

	openEditModal = function (memberId) {
		origOpen(memberId);
		var member = allMembers.find(function (m) {
			return m._id === memberId;
		});
		if (member) {
			var br = member.Role && member.Role.length ? member.Role.slice() : ["user"];
			lastCommitted = {
				flighthours: Number(member.Flighthours || 0),
				callsign: (member.Callsign || "").trim().toUpperCase(),
				roles: br.slice().sort(),
			};
		} else {
			lastCommitted = null;
		}
		clearTimeout(timer);
		timer = null;
	};

	closeEditModal = function () {
		clearTimeout(timer);
		timer = null;
		if (!currentEditingMemberId) {
			origClose();
			lastCommitted = null;
			return;
		}
		var mid = currentEditingMemberId;
		var cur = snap();
		if (isNaN(cur.flighthours) || cur.flighthours < 0) {
			origClose();
			lastCommitted = null;
			return;
		}
		var preUndo = lastCommitted
			? {
					flighthours: lastCommitted.flighthours,
					callsign: lastCommitted.callsign,
					roles: lastCommitted.roles.slice(),
				}
			: null;
		if (!preUndo || equal(cur, lastCommitted)) {
			origClose();
			lastCommitted = null;
			return;
		}
		persistMember(mid)
			.then(function () {
				patchLocal(mid);
				lastCommitted = snap();
				origClose();
				lastCommitted = null;
				showUndo(mid, preUndo);
			})
			.catch(function (err) {
				var el = document.getElementById("errorMessage");
				if (el) {
					el.textContent = err.message;
					el.classList.add("show");
				}
			});
	};

	saveChanges = function () {
		clearTimeout(timer);
		timer = null;
		if (!currentEditingMemberId) {
			showError("No member selected");
			return;
		}
		var flighthours = parseFloat(document.getElementById("flighthours").value);
		if (isNaN(flighthours) || flighthours < 0) {
			showError("Flight hours must be a valid non-negative number");
			return;
		}
		persistMember(currentEditingMemberId)
			.then(function () {
				patchLocal(currentEditingMemberId);
				lastCommitted = snap();
				showSuccess("Member updated successfully");
				setTimeout(function () {
					origClose();
					lastCommitted = null;
					loadMembers();
				}, 1200);
			})
			.catch(function (error) {
				showError("Error saving changes: " + error.message);
			});
	};

	(function bindAutosaveInputs() {
		var fh = document.getElementById("flighthours");
		var cs = document.getElementById("callsign");
		var roles = document.getElementById("currentRoles");
		if (fh) fh.addEventListener("input", scheduleAutosave);
		if (cs) cs.addEventListener("input", scheduleAutosave);
		if (roles) {
			var obs = new MutationObserver(function () {
				scheduleAutosave();
			});
			obs.observe(roles, { childList: true, subtree: true });
		}
	})();

	window.addEventListener("beforeunload", function (e) {
		if (!currentEditingMemberId || !lastCommitted) return;
		var cur = snap();
		if (isNaN(cur.flighthours) || equal(cur, lastCommitted)) return;
		e.preventDefault();
		e.returnValue = "";
	});
})();
