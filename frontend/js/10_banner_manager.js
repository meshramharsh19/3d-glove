// ==========================
// Banner Manager
// ==========================

let selectedHouseId = null;
let selectedHouseData = null;
let selectedHouseAliases = [];
let bannerUiPositionRaf = null;
let lastBannerModalTrigger = null;
let bannerOpenAnimationResetTimer = null;
const bannerDatePickerState = {
  monthCursor: new Date(),
  selectedIsoDate: "",
};

scheduleBannerUiPosition();

window.addEventListener("resize", scheduleBannerUiPosition);
document.addEventListener("DOMContentLoaded", () => {
  scheduleBannerUiPosition();
  initBannerDatePicker();
});

// Show button after selecting house
function showAddBannerButton(idOrEntity) {
  const selection = resolveSelectedHouse(idOrEntity);
  selectedHouseId = selection.houseId;
  selectedHouseData = selection.houseData;
  selectedHouseAliases = selection.aliases;

  if (!selectedHouseId) {
    console.warn("No valid house id resolved for banner manager", idOrEntity);
    return;
  }

  renderSelectedHouseData(selectedHouseId, selectedHouseData);

  const section = document.getElementById("bannerSection");

  if (!section) return;

  section.classList.add("banner-visible");
  triggerBannerSectionOpenAnimation(section);

  scheduleBannerUiPosition();
  loadBannerListByAliases(selectedHouseAliases);
}

function triggerBannerSectionOpenAnimation(section) {
  if (!section) return;

  if (bannerOpenAnimationResetTimer) {
    window.clearTimeout(bannerOpenAnimationResetTimer);
    bannerOpenAnimationResetTimer = null;
  }

  section.classList.remove("banner-opening");
  // Force reflow so animation restarts on each new selection.
  void section.offsetWidth;
  section.classList.add("banner-opening");

  bannerOpenAnimationResetTimer = window.setTimeout(() => {
    section.classList.remove("banner-opening");
    bannerOpenAnimationResetTimer = null;
  }, 420);
}

function renderSelectedHouseData(houseId, inputHouseData = null) {
  const idEl = document.getElementById("houseDataId");
  const ownerEl = document.getElementById("houseDataOwner");
  const mobileEl = document.getElementById("houseDataMobile");
  const propertyEl = document.getElementById("houseDataProperty");
  const typeEl = document.getElementById("houseDataType");
  const addressEl = document.getElementById("houseDataAddress");

  if (!idEl || !ownerEl || !mobileEl || !propertyEl || !typeEl || !addressEl) {
    return;
  }

  const houseData =
    inputHouseData ||
    selectedHouseData ||
    (typeof getCustomHouseData === "function" ? getCustomHouseData(houseId) : null);

  const safeId =
    pickValue(houseData, ["Property Number", "propertyNumber", "propertyNo", "_id"]) ||
    houseId ||
    "-";

  const owner =
    pickValue(houseData, ["Name of the Property Owner", "ownerName", "name"]) || "-";

  const mobile =
    pickValue(houseData, [
      "Telephone / Mobile Number",
      "mobileNumber",
      "mobile",
      "phone",
      "ownerUID",
      "occupierUID",
    ]) || "-";

  const propertyName =
    pickValue(houseData, ["Name of the Property", "propertyName", "propertyCategory"]) || "-";

  const type =
    pickValue(houseData, ["Nature of Property", "natureOfProperty", "ownerType", "propertyCategory"]) ||
    "-";

  const address =
    pickValue(houseData, ["Address of Property", "propertyAddress", "address"]) || "-";

  idEl.textContent = safeId;
  ownerEl.textContent = owner;
  propertyEl.textContent = propertyName;
  typeEl.textContent = type;
  mobileEl.textContent = mobile;
  addressEl.textContent = address;
}

function resolveSelectedHouse(idOrEntity) {
  let houseData =
    typeof getCustomHouseData === "function" ? getCustomHouseData(idOrEntity) : null;

  if (!houseData && typeof idOrEntity === "string") {
    houseData = findHouseDataByLooseMatch(idOrEntity);
  }

  const canonicalId = pickValue(houseData, [
    "Property Number",
    "propertyNumber",
    "propertyNo",
    "_id",
  ]);

  const fallbackId = extractEntityId(idOrEntity);
  const rawEntityName = extractEntityName(idOrEntity);
  const houseId = canonicalId || fallbackId || rawEntityName;
  const aliases = buildHouseAliases(canonicalId, fallbackId, rawEntityName, houseData);

  return {
    houseId,
    houseData,
    aliases,
  };
}

function extractEntityName(idOrEntity) {
  if (!idOrEntity || typeof idOrEntity !== "object") {
    return "";
  }

  return normalizeIdentifier(idOrEntity.name);
}

function extractEntityId(idOrEntity) {
  if (typeof idOrEntity === "string") {
    return normalizeIdentifier(idOrEntity);
  }

  if (!idOrEntity || typeof idOrEntity !== "object") {
    return "";
  }

  try {
    if (idOrEntity.properties && typeof idOrEntity.properties.getValue === "function") {
      const props = idOrEntity.properties.getValue(viewer.clock.currentTime) || {};
      return (
        pickValue(props, ["Property Number", "propertyNumber", "propertyNo", "_id"]) ||
        normalizeIdentifier(idOrEntity.name)
      );
    }
  } catch (error) {
    console.warn("Could not extract entity id:", error);
  }

  return normalizeIdentifier(idOrEntity.name);
}

function findHouseDataByLooseMatch(rawId) {
  const db = window.ptaxDatabase || {};
  const target = normalizeIdentifier(rawId).toLowerCase();

  if (!target) return null;

  for (const key in db) {
    if (!Object.prototype.hasOwnProperty.call(db, key)) continue;

    const rec = db[key];
    if (!rec) continue;

    const candidates = [
      rec["Property Number"],
      rec.propertyNumber,
      rec.propertyNo,
      rec._id,
      rec["Name of the Property Owner"],
      rec.ownerName,
      rec["Name of the Property"],
      rec.propertyName,
    ];

    const isMatch = candidates.some(
      (value) => normalizeIdentifier(value).toLowerCase() === target
    );

    if (isMatch) return rec;
  }

  return null;
}

function buildHouseAliases(primaryId, fallbackId, rawEntityName, houseData) {
  const values = [
    primaryId,
    fallbackId,
    rawEntityName,
    pickValue(houseData, ["Property Number", "propertyNumber", "propertyNo", "_id"]),
    pickValue(houseData, ["Name of the Property", "propertyName"]),
    pickValue(houseData, ["Name of the Property Owner", "ownerName"]),
  ];

  return Array.from(new Set(values.map(normalizeIdentifier).filter(Boolean)));
}

function normalizeIdentifier(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

// Open Modal
function openBannerModal() {
  if (!selectedHouseId) {
    alert("No house selected");
    return;
  }

  const houseIdInput = document.getElementById("bannerHouseId");
  const modal = document.getElementById("bannerModal");
  const titleInput = document.getElementById("bannerTitle");

  if (document.activeElement instanceof HTMLElement) {
    lastBannerModalTrigger = document.activeElement;
  }

  if (houseIdInput) houseIdInput.value = selectedHouseId;
  initBannerDatePicker();
  if (modal) {
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
  }

  titleInput?.focus();
}

// Close Modal
function closeBannerModal() {
  const modal = document.getElementById("bannerModal");
  setBannerDateCalendarOpen(false);

  if (modal) {
    if (document.activeElement instanceof HTMLElement && modal.contains(document.activeElement)) {
      document.activeElement.blur();
    }

    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
  }

  if (lastBannerModalTrigger && document.body.contains(lastBannerModalTrigger)) {
    lastBannerModalTrigger.focus();
    return;
  }

  const fallbackTrigger = document.getElementById("bannerSectionAddBtn");
  fallbackTrigger?.focus();
}

function initBannerDatePicker() {
  const picker = document.getElementById("bannerDatePicker");
  const displayInput = document.getElementById("bannerDateDisplay");
  const hiddenInput = document.getElementById("bannerDate");
  const toggleButton = document.getElementById("bannerDateToggle");
  const calendar = document.getElementById("bannerDateCalendar");

  if (!picker || !displayInput || !hiddenInput || !toggleButton || !calendar) return;
  if (picker.dataset.datePickerBound === "true") return;

  picker.dataset.datePickerBound = "true";

  picker.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  setBannerDateValue(hiddenInput.value || "", false);

  const toggleCalendar = () => {
    const isOpen = !calendar.hasAttribute("hidden");
    setBannerDateCalendarOpen(!isOpen);
  };

  displayInput.addEventListener("click", toggleCalendar);

  toggleButton.addEventListener("click", (event) => {
    event.preventDefault();
    toggleCalendar();
  });

  document.addEventListener("click", (event) => {
    if (!picker.contains(event.target)) {
      setBannerDateCalendarOpen(false);
    }
  });
}

function setBannerDateCalendarOpen(isOpen) {
  const displayInput = document.getElementById("bannerDateDisplay");
  const calendar = document.getElementById("bannerDateCalendar");

  if (!displayInput || !calendar) return;

  if (!isOpen) {
    calendar.setAttribute("hidden", "");
    displayInput.setAttribute("aria-expanded", "false");
    return;
  }

  renderBannerDateCalendar();
  calendar.removeAttribute("hidden");
  displayInput.setAttribute("aria-expanded", "true");
}

function setBannerDateValue(isoDate, shouldCloseCalendar = true) {
  const hiddenInput = document.getElementById("bannerDate");
  const displayInput = document.getElementById("bannerDateDisplay");

  if (!hiddenInput || !displayInput) return;

  const normalizedIso = normalizeBannerIsoDate(isoDate);
  bannerDatePickerState.selectedIsoDate = normalizedIso;

  if (normalizedIso) {
    hiddenInput.value = normalizedIso;
    displayInput.value = formatIsoDateForBannerDisplay(normalizedIso);
    const [year, month] = normalizedIso.split("-");
    bannerDatePickerState.monthCursor = new Date(Number(year), Number(month) - 1, 1);
  } else {
    hiddenInput.value = "";
    displayInput.value = "";
    bannerDatePickerState.monthCursor = new Date();
  }

  if (shouldCloseCalendar) {
    setBannerDateCalendarOpen(false);
  }
}

function renderBannerDateCalendar() {
  const calendar = document.getElementById("bannerDateCalendar");
  if (!calendar) return;

  const monthCursor = bannerDatePickerState.monthCursor || new Date();
  const year = monthCursor.getFullYear();
  const month = monthCursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const firstWeekDay = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthLabel = firstDay.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const weekdayLabels = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const weekdayMarkup = weekdayLabels.map((label) => `<span>${label}</span>`).join("");

  const todayIso = buildIsoDateFromParts(
    new Date().getFullYear(),
    new Date().getMonth(),
    new Date().getDate()
  );

  const emptyLeadingDays = Array.from({ length: firstWeekDay })
    .map(() => '<span class="banner-date-day-empty"></span>')
    .join("");

  const dayButtons = Array.from({ length: daysInMonth }, (_, index) => {
    const dayNumber = index + 1;
    const isoDate = buildIsoDateFromParts(year, month, dayNumber);
    const isToday = isoDate === todayIso;
    const isSelected = isoDate === bannerDatePickerState.selectedIsoDate;
    const dayClass = [
      "banner-date-day",
      isToday ? "is-today" : "",
      isSelected ? "is-selected" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return `<button type="button" class="${dayClass}" data-date="${isoDate}">${dayNumber}</button>`;
  }).join("");

  calendar.innerHTML = `<div class="banner-date-calendar-header">
    <span class="banner-date-calendar-title">${monthLabel}</span>
    <div class="banner-date-calendar-nav">
      <button type="button" data-nav="prev" aria-label="Previous month">&#x2039;</button>
      <button type="button" data-nav="next" aria-label="Next month">&#x203A;</button>
    </div>
  </div>
  <div class="banner-date-calendar-weekdays">${weekdayMarkup}</div>
  <div class="banner-date-calendar-days">${emptyLeadingDays}${dayButtons}</div>`;

  const prevButton = calendar.querySelector('button[data-nav="prev"]');
  const nextButton = calendar.querySelector('button[data-nav="next"]');

  prevButton?.addEventListener("click", () => {
    bannerDatePickerState.monthCursor = new Date(year, month - 1, 1);
    renderBannerDateCalendar();
  });

  nextButton?.addEventListener("click", () => {
    bannerDatePickerState.monthCursor = new Date(year, month + 1, 1);
    renderBannerDateCalendar();
  });

  calendar.querySelectorAll("button[data-date]").forEach((button) => {
    button.addEventListener("click", () => {
      const isoDate = button.getAttribute("data-date") || "";
      setBannerDateValue(isoDate);
    });
  });
}

function normalizeBannerIsoDate(value) {
  if (!value) return "";

  const rawValue = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) return "";

  const [yearText, monthText, dayText] = rawValue.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  const testDate = new Date(year, month - 1, day);
  const isValid =
    testDate.getFullYear() === year &&
    testDate.getMonth() === month - 1 &&
    testDate.getDate() === day;

  return isValid ? rawValue : "";
}

function buildIsoDateFromParts(year, monthIndex, dayOfMonth) {
  const month = String(monthIndex + 1).padStart(2, "0");
  const day = String(dayOfMonth).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatIsoDateForBannerDisplay(isoDate) {
  const normalizedIso = normalizeBannerIsoDate(isoDate);
  if (!normalizedIso) return "";

  const [year, month, day] = normalizedIso.split("-");
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  const monthLabel = monthNames[Number(month) - 1] || month;
  return `${Number(day)} ${monthLabel} ${year}`;
}

document.addEventListener("click", (event) => {
  const modal = document.getElementById("bannerModal");
  if (!modal || !modal.classList.contains("is-open")) return;

  if (event.target === modal) {
    closeBannerModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;

  const modal = document.getElementById("bannerModal");
  if (modal && modal.classList.contains("is-open")) {
    closeBannerModal();
  }
});

// Save Banner to MongoDB
async function saveBanner() {
  const houseId = document.getElementById("bannerHouseId")?.value;

  if (!houseId) {
    alert("No house selected");
    return;
  }

  const banner = {
    house_id: houseId,
    title: document.getElementById("bannerTitle")?.value,
    type: document.getElementById("bannerType")?.value,
    date: document.getElementById("bannerDate")?.value,
  };

  try {
    const response = await fetch("http://localhost:4000/api/add-banner", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(banner),
    });

    const result = await response.json();
    console.log("Saved:", result);

    alert("Banner Saved Successfully");
    closeBannerModal();
    const titleInput = document.getElementById("bannerTitle");
    const typeInput = document.getElementById("bannerType");
    const dateDisplayInput = document.getElementById("bannerDateDisplay");

    if (titleInput) titleInput.value = "";
    if (typeInput) typeInput.value = "";
    if (dateDisplayInput) {
      setBannerDateValue("", false);
    }

    loadBannerListByAliases(selectedHouseAliases);
  } catch (error) {
    console.error("Save banner error:", error);
    alert("Error saving banner");
  }
}

// Legacy single-id loader
async function loadBannerList(houseId) {
  if (!houseId) {
    displayBannerList([]);
    return;
  }

  try {
    const response = await fetch(
      `http://localhost:4000/api/banners/${encodeURIComponent(houseId)}`
    );
    const banners = await response.json();
    displayBannerList(Array.isArray(banners) ? banners : []);
  } catch (error) {
    console.error("Banner load error:", error);
    displayBannerList([]);
  }
}

async function loadBannerListByAliases(aliases) {
  const uniqueAliases = Array.from(
    new Set((Array.isArray(aliases) ? aliases : []).map(normalizeIdentifier).filter(Boolean))
  );

  console.log("Banner alias lookup:", uniqueAliases);

  if (uniqueAliases.length === 0) {
    displayBannerList([]);
    return;
  }

  try {
    const allResults = await Promise.all(uniqueAliases.map(fetchBannersForHouseId));

    const merged = [];
    const seenIds = new Set();

    allResults.forEach((list) => {
      if (!Array.isArray(list)) return;

      list.forEach((item) => {
        const key = item && item._id ? String(item._id) : JSON.stringify(item);
        if (seenIds.has(key)) return;
        seenIds.add(key);
        merged.push(item);
      });
    });

    console.log("Banner alias lookup result count:", merged.length);

    displayBannerList(merged);
  } catch (error) {
    console.error("Banner load (aliases) error:", error);
    displayBannerList([]);
  }
}

async function fetchBannersForHouseId(houseId) {
  const response = await fetch(
    `http://localhost:4000/api/banners/${encodeURIComponent(houseId)}`
  );

  if (!response.ok) {
    throw new Error(`Banner fetch failed for ${houseId}`);
  }

  const list = await response.json();
  return Array.isArray(list) ? list : [];
}

// Display Banner List in UI
function displayBannerList(banners) {
  const list = document.getElementById("bannerList");
  if (!list) return;

  list.innerHTML = "";

  if (!Array.isArray(banners) || banners.length === 0) {
    list.innerHTML = '<li class="banner-empty-state">No banners</li>';
    return;
  }

  banners.forEach((banner) => {
    const li = document.createElement("li");
    li.className = "banner-item";

    const safeTitle = escapeHtml(banner.title || "Untitled");
    const safeType = escapeHtml(banner.type || "General");
    const safeDate = escapeHtml(formatBannerDate(banner.date));

    li.innerHTML = `<div class="banner-item-card">
      <span class="banner-item-title">${safeTitle}</span>
      <div class="banner-item-meta">
        <span class="banner-item-type">${safeType}</span>
        <span class="banner-item-date">${safeDate}</span>
      </div>
    </div>`;

    li.onclick = () => {
      showBannerDetails(banner);
    };

    list.appendChild(li);
  });

  scheduleBannerUiPosition();
}

function scheduleBannerUiPosition() {
  if (bannerUiPositionRaf !== null) return;

  bannerUiPositionRaf = window.requestAnimationFrame(() => {
    bannerUiPositionRaf = null;
    positionBannerUi();
  });
}

function positionBannerUi() {
  const section = document.getElementById("bannerSection");

  if (!section) return;

  const rail = document.querySelector(".map-rail");
  const topbar = document.getElementById("topbar");

  const topbarBottom = topbar ? topbar.getBoundingClientRect().bottom : 62;
  const minTop = Math.round(topbarBottom + 8);
  let sectionTop = Math.round(topbarBottom + 14);
  let rightOffset = 20;

  if (rail) {
    const railRect = rail.getBoundingClientRect();
    const safeGap = 24;
    rightOffset = Math.max(20, Math.round(window.innerWidth - railRect.left + safeGap));

    // Keep section below right-side controls so it doesn't visually stack over them.
    sectionTop = Math.max(minTop, Math.round(railRect.bottom + 10));
  }

  section.style.right = `${rightOffset}px`;

  const sectionHeight = section.offsetHeight || 220;
  const maxSectionTop = Math.max(minTop, Math.round(window.innerHeight - sectionHeight - 12));

  sectionTop = Math.max(minTop, Math.min(sectionTop, maxSectionTop));
  section.style.top = `${sectionTop}px`;

}

// Show Banner Details
function showBannerDetails(banner) {
  alert(
    "Banner Details:\n\n" +
      "Title: " +
      banner.title +
      "\n" +
      "Type: " +
      banner.type +
      "\n" +
      "Date: " +
      banner.date
  );
}

function closeBannerSection() {
  const section = document.getElementById("bannerSection");
  if (!section) return;

  section.classList.remove("banner-visible");
  section.classList.remove("banner-opening");
}

function formatBannerDate(rawDate) {
  if (!rawDate) return "No date";

  const date = new Date(rawDate);
  if (Number.isNaN(date.getTime())) return rawDate;

  return date.toLocaleDateString();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function pickValue(obj, keys) {
  if (!obj || !Array.isArray(keys)) return "";

  for (const key of keys) {
    const value = obj[key];

    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value);
    }
  }

  return "";
}

// Explicit global bindings for inline HTML and other script files.
window.showAddBannerButton = showAddBannerButton;
window.openBannerModal = openBannerModal;
window.closeBannerModal = closeBannerModal;
window.closeBannerSection = closeBannerSection;
window.saveBanner = saveBanner;
