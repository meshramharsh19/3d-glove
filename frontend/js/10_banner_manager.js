// ==========================
// Banner Manager
// ==========================

let selectedHouseId = null;
let selectedHouseData = null;
let selectedHouseAliases = [];
let bannerUiPositionRaf = null;

scheduleBannerUiPosition();

window.addEventListener("resize", scheduleBannerUiPosition);
document.addEventListener("DOMContentLoaded", scheduleBannerUiPosition);

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

  const btn = document.getElementById("addBannerBtn");
  const section = document.getElementById("bannerSection");

  if (!btn || !section) return;

  btn.style.display = "block";
  section.classList.add("banner-visible");

  scheduleBannerUiPosition();
  loadBannerListByAliases(selectedHouseAliases);
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

  if (houseIdInput) houseIdInput.value = selectedHouseId;
  if (modal) modal.style.display = "block";
}

// Close Modal
function closeBannerModal() {
  const modal = document.getElementById("bannerModal");
  if (modal) modal.style.display = "none";
}

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
  const btn = document.getElementById("addBannerBtn");
  const section = document.getElementById("bannerSection");

  if (!btn || !section) return;

  const rail = document.querySelector(".map-rail");
  const topbar = document.getElementById("topbar");

  const topbarBottom = topbar ? topbar.getBoundingClientRect().bottom : 62;
  const minTop = Math.round(topbarBottom + 8);
  let sectionTop = Math.round(topbarBottom + 14);
  let rightOffset = 16;

  if (rail) {
    const railRect = rail.getBoundingClientRect();

    rightOffset = Math.max(16, Math.round(window.innerWidth - railRect.left + 12));

    // Keep the cart in upper area while still avoiding toolbar overlap.
    sectionTop = Math.max(minTop, Math.round(topbarBottom + 12));
  }

  btn.style.right = `${rightOffset}px`;
  section.style.right = `${rightOffset}px`;

  const sectionHeight = section.offsetHeight || 220;
  const maxSectionTop = Math.max(minTop, Math.round(window.innerHeight - sectionHeight - 12));

  sectionTop = Math.max(minTop, Math.min(sectionTop, maxSectionTop));
  section.style.top = `${sectionTop}px`;

  const buttonHeight = btn.offsetHeight || 36;
  const buttonGap = 8;
  const preferredButtonTop = sectionTop + sectionHeight + buttonGap;
  const maxButtonTop = Math.max(minTop, Math.round(window.innerHeight - buttonHeight - 10));
  const buttonTop = Math.max(minTop, Math.min(preferredButtonTop, maxButtonTop));
  btn.style.top = `${buttonTop}px`;
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
window.saveBanner = saveBanner;
