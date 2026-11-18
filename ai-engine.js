// Shared PulseLink AI Engine & Database
var PulseAI = (function() {

  // Medically accurate RBC Donor -> Recipient Compatibility Rules
  var BLOOD_COMPATIBILITY = {
    "O-":  ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"], // Universal Donor
    "O+":  ["O+", "A+", "B+", "AB+"],
    "A-":  ["A-", "A+", "AB-", "AB+"],
    "A+":  ["A+", "AB+"],
    "B-":  ["B-", "B+", "AB-", "AB+"],
    "B+":  ["B+", "AB+"],
    "AB-": ["AB-", "AB+"],
    "AB+": ["AB+"] // Universal Recipient
  };

  var DEFAULT_DONORS = [
    { id: 1, name: "Donor A", blood: "O-", resource: "Blood", area: "Sector 49, Gurgaon", phone: "98XXXXXXXX", available: true },
    { id: 2, name: "Donor B", blood: "A+", resource: "Blood", area: "Sohna Road, Gurgaon", phone: "98XXXXXXXX", available: true },
    { id: 3, name: "Donor C", blood: "B-", resource: "Blood", area: "Sector 56, Gurgaon", phone: "98XXXXXXXX", available: true },
    { id: 4, name: "Donor D", blood: "O+", resource: "Blood", area: "DLF Phase 4", phone: "98XXXXXXXX", available: true },
    { id: 5, name: "Supplier E (Oxygen Bank)", blood: "N/A", resource: "Oxygen Cylinder (10L)", area: "Badshahpur Chowk", phone: "98XXXXXXXX", available: true },
    { id: 6, name: "Donor F", blood: "AB-", resource: "Blood", area: "Sector 50, Gurgaon", phone: "98XXXXXXXX", available: true },
    { id: 7, name: "Supplier G (Medical Aid)", blood: "N/A", resource: "Oxygen Concentrator", area: "Sector 49, Gurgaon", phone: "98XXXXXXXX", available: true }
  ];

  var now = Date.now();
  var DEFAULT_REQUESTS = [
    {
      id: 501,
      resourceType: "Blood",
      bloodGroup: "A+",
      units: 2,
      hospital: "Medanta The Medicity, Sector 38",
      phone: "98XXXXXXXX",
      urgencyScore: 92,
      priority: "Critical",
      rawMessage: "URGENT!! Need 2 units A+ blood at Medanta Hospital Sector 38 for emergency surgery. Contact H 98XXXXXXXX ASAP!",
      createdAt: now - (45 * 60 * 1000),
      expiresAt: now + (5 * 3600 * 1000),
      status: "Active"
    },
    {
      id: 502,
      resourceType: "Oxygen Cylinder",
      bloodGroup: "N/A",
      units: 1,
      hospital: "Artemis Hospital, Sector 51",
      phone: "98XXXXXXXX",
      urgencyScore: 86,
      priority: "Critical",
      rawMessage: "Please help! Need 1 oxygen cylinder immediately near Artemis Hospital Sector 51, SpO2 dropping. Call I 98XXXXXXXX",
      createdAt: now - (90 * 60 * 1000),
      expiresAt: now + (3 * 3600 * 1000),
      status: "Active"
    },
    {
      id: 503,
      resourceType: "Blood",
      bloodGroup: "B+",
      units: 1,
      hospital: "Park Hospital, Sector 47",
      phone: "98XXXXXXXX",
      urgencyScore: 68,
      priority: "Moderate",
      rawMessage: "Forwarded: Need 1 unit B+ blood at Park Hospital tomorrow morning. Contact J 98XXXXXXXX",
      createdAt: now - (14 * 3600 * 1000),
      expiresAt: now - (2 * 3600 * 1000),
      status: "Active"
    }
  ];

  function getRequests() {
    var stored = localStorage.getItem("pulselink_requests_v1");
    if (!stored) {
      localStorage.setItem("pulselink_requests_v1", JSON.stringify(DEFAULT_REQUESTS));
      return DEFAULT_REQUESTS;
    }
    return JSON.parse(stored);
  }

  function saveRequests(list) {
    localStorage.setItem("pulselink_requests_v1", JSON.stringify(list));
  }

  function getDonors() {
    var stored = localStorage.getItem("pulselink_donors_v1");
    if (!stored) {
      localStorage.setItem("pulselink_donors_v1", JSON.stringify(DEFAULT_DONORS));
      return DEFAULT_DONORS;
    }
    return JSON.parse(stored);
  }

  function saveDonors(list) {
    localStorage.setItem("pulselink_donors_v1", JSON.stringify(list));
  }

  function resetAll() {
    localStorage.removeItem("pulselink_requests_v1");
    localStorage.removeItem("pulselink_donors_v1");
  }

  // ==========================================================
  // AI FUNCTION 1: Unstructured WhatsApp NLP Entity Extractor
  // ==========================================================
  function parseEmergencyMessage(rawText) {
    var text = rawText.trim();
    var lower = text.toLowerCase();

    // 1. Detect Resource Type (Blood vs Oxygen)
    var resourceType = "Blood";
    if (lower.includes("oxygen") || lower.includes("cylinder") || lower.includes("concentrator") || lower.includes("spo2")) {
      resourceType = "Oxygen Cylinder";
    }

    // 2. Extract Blood Group via Regex
    var bloodGroup = "Unknown";
    var explicitMatch = text.match(/\b(AB|A|B|O)\s*([+-])\b/i);
    if (explicitMatch) {
      bloodGroup = explicitMatch[1].toUpperCase() + explicitMatch[2];
    } else {
      var wordMatch = lower.match(/\b(ab|a|b|o)\s*(positive|negative|pos|neg)\b/);
      if (wordMatch) {
        var sign = (wordMatch[2].startsWith("pos")) ? "+" : "-";
        bloodGroup = wordMatch[1].toUpperCase() + sign;
      }
    }
    if (resourceType === "Oxygen Cylinder" && bloodGroup === "Unknown") {
      bloodGroup = "N/A";
    }

    // 3. Extract Units / Cylinders Needed
    var units = 1;
    var unitMatch = lower.match(/(\d+)\s*(unit|units|bag|bags|cylinder|cylinders|bottle|bottles)/);
    if (unitMatch) {
      units = parseInt(unitMatch[1], 10);
    }

    // 4. Extract Hospital / Location
    var hospital = "Location Not Specified";
    var hospMatch = text.match(/(?:at|near|in)\s+([A-Za-z0-9\s,.-]{4,45}?)(?=\s+(?:for|asap|urgent|contact|call|patient|by|tomorrow|today)|[.!\n]|$)/i);
    if (hospMatch && hospMatch[1].trim().length > 3) {
      hospital = hospMatch[1].trim();
    } else if (lower.includes("hospital") || lower.includes("sector")) {
      var fallbackHosp = text.match(/([A-Za-z0-9\s]+(?:Hospital|Medicity|Clinic|Sector\s*\d+))/i);
      if (fallbackHosp) hospital = fallbackHosp[1].trim();
    }

    // 5. Extract Contact Phone Number (Supports both real digits and masked 98XXXXXXXX format)
    var phone = "Not Provided";
    var phoneMatch = text.match(/(?:\+91[\s-]?)?[6-9][\dX]{4}[\s-]?[\dX]{5}/i);
    if (phoneMatch) {
      phone = phoneMatch[0].trim();
    }

    // 6. Urgency Scoring & Expiration Window Calculation
    var urgencyScore = 50;
    var urgentSignals = ["urgent", "asap", "immediately", "critical", "icu", "accident", "bleeding", "surgery", "dropping", "emergency", "stat"];
    var hits = 0;
    for (var i = 0; i < urgentSignals.length; i++) {
      if (lower.includes(urgentSignals[i])) {
        urgencyScore += 12;
        hits++;
      }
    }
    if (bloodGroup.endsWith("-")) urgencyScore += 10;
    if (urgencyScore > 99) urgencyScore = 99;

    var priority = (urgencyScore >= 75) ? "Critical" : "Moderate";

    var isStaleForward = lower.includes("yesterday") || lower.includes("last week") || lower.includes("closed");
    var validHours = (priority === "Critical") ? 6 : 12;
    var expiresAt = isStaleForward
      ? Date.now() - (60 * 60 * 1000)
      : Date.now() + (validHours * 3600 * 1000);

    var confidence = 65 + (hits * 5) + (bloodGroup !== "Unknown" ? 10 : 0) + (phone !== "Not Provided" ? 10 : 0);
    if (confidence > 98) confidence = 98;

    return {
      resourceType: resourceType,
      bloodGroup: bloodGroup,
      units: units,
      hospital: hospital,
      phone: phone,
      urgencyScore: urgencyScore,
      priority: priority,
      confidence: confidence,
      validHours: validHours,
      expiresAt: expiresAt,
      isExpired: expiresAt < Date.now()
    };
  }

  // ==========================================================
  // AI FUNCTION 2: Medical Blood & Resource Compatibility Matcher
  // ==========================================================
  function findCompatibleDonors(resourceType, recipientBlood) {
    var donors = getDonors();
    return donors.filter(function(d) {
      if (!d.available) return false;
      if (resourceType === "Oxygen Cylinder") {
        return d.resource.toLowerCase().includes("oxygen");
      }
      if (d.resource !== "Blood") return false;
      if (!recipientBlood || recipientBlood === "Unknown" || recipientBlood === "N/A") return true;

      var canDonateTo = BLOOD_COMPATIBILITY[d.blood] || [];
      return canDonateTo.includes(recipientBlood);
    });
  }

  // ==========================================================
  // AI FUNCTION 3: Expiration & Validity Filter
  // ==========================================================
  function filterValidRequests(requestsList, includeExpired) {
    var currentTime = Date.now();
    return requestsList.map(function(req) {
      var expired = req.expiresAt < currentTime;
      var minsLeft = Math.round((req.expiresAt - currentTime) / 60000);
      return Object.assign({}, req, {
        isExpired: expired,
        timeLabel: expired ? "Expired" : (minsLeft > 60 ? Math.round(minsLeft / 60) + "h left" : minsLeft + "m left")
      });
    }).filter(function(req) {
      return includeExpired ? true : !req.isExpired;
    });
  }

  // ==========================================================
  // AI FUNCTION 4: Supply vs Demand Shortage Analyzer
  // ==========================================================
  function analyzeShortages() {
    var activeReqs = filterValidRequests(getRequests(), false).filter(function(r) { return r.status === "Active"; });
    var donors = getDonors().filter(function(d) { return d.available; });

    var bloodGroups = ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"];
    var report = bloodGroups.map(function(bg) {
      var demandUnits = activeReqs
        .filter(function(r) { return r.resourceType === "Blood" && r.bloodGroup === bg; })
        .reduce(function(sum, r) { return sum + r.units; }, 0);

      var compatibleSupply = donors.filter(function(d) {
        return d.resource === "Blood" && (BLOOD_COMPATIBILITY[d.blood] || []).includes(bg);
      }).length;

      var risk = "Balanced";
      if (demandUnits > compatibleSupply) risk = "Critical Shortage";
      else if (compatibleSupply <= 1) risk = "Low Reserve";

      return {
        bloodGroup: bg,
        demandUnits: demandUnits,
        compatibleSupply: compatibleSupply,
        risk: risk
      };
    });

    return report;
  }

  return {
    BLOOD_COMPATIBILITY: BLOOD_COMPATIBILITY,
    getRequests: getRequests,
    saveRequests: saveRequests,
    getDonors: getDonors,
    saveDonors: saveDonors,
    resetAll: resetAll,
    parseEmergencyMessage: parseEmergencyMessage,
    findCompatibleDonors: findCompatibleDonors,
    filterValidRequests: filterValidRequests,
    analyzeShortages: analyzeShortages
  };
})();
