// ==========================
// Banner Manager
// ==========================

let selectedHouseId = null;
let bannerUiPositionRaf = null;

scheduleBannerUiPosition();

window.addEventListener(
    "resize",
    scheduleBannerUiPosition
);

document.addEventListener(
    "DOMContentLoaded",
    scheduleBannerUiPosition
);


// Show button after selecting house
function showAddBannerButton(houseId) {

    console.log("House Selected:", houseId);

    selectedHouseId = houseId;

    const btn =
        document.getElementById("addBannerBtn");

    if (!btn) return;

    btn.style.display = "block";

    scheduleBannerUiPosition();

    // LOAD banners for this house
    loadBannerList(houseId);
}



// Open Modal
function openBannerModal() {

    if (!selectedHouseId) {

        alert("No house selected");

        return;

    }

    document
        .getElementById("bannerHouseId")
        .value = selectedHouseId;

    document
        .getElementById("bannerModal")
        .style.display = "block";

}



// Close Modal
function closeBannerModal() {

    document
        .getElementById("bannerModal")
        .style.display = "none";

}



// Save Banner (temporary console test)
// ==========================
// Save Banner to MongoDB
// ==========================

async function saveBanner() {

    const houseId =
        document.getElementById("bannerHouseId").value;

    const banner = {

        house_id: houseId,

        title:
            document.getElementById("bannerTitle").value,

        type:
            document.getElementById("bannerType").value,

        date:
            document.getElementById("bannerDate").value
    };

    console.log("Saving banner:", banner);

    try {

        const response =
            await fetch(
                "http://localhost:4000/api/add-banner",  // ✅ FIXED
                {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json"
                    },

                    body: JSON.stringify(banner)
                }
            );

        const result =
            await response.json();

        console.log("Saved:", result);

        alert("Banner Saved Successfully");

        closeBannerModal();

        loadBannerList(houseId);

    }
    catch(error) {

        console.error(
            "Save banner error:",
            error
        );

        alert("Error saving banner");

    }
}


// ==========================
// Load Banner List from Mongo
// ==========================

async function loadBannerList(houseId) {

    console.log(
        "Loading banners for:",
        houseId
    );

    try {

        const response =
            await fetch(
              `http://localhost:4000/api/banners/${houseId}`
            );

        const banners =
            await response.json();

        console.log(
            "Banners received:",
            banners
        );

        displayBannerList(banners);

    }
    catch(error) {

        console.error(
            "Banner load error:",
            error
        );

    }

}



// ==========================
// Display Banner List in UI
// ==========================

function displayBannerList(banners) {

    const list =
        document.getElementById("bannerList");

    if (!list) return;

    list.innerHTML = "";

    if (banners.length === 0) {

        list.innerHTML =
            `<li class="banner-empty-state">
             No banners
             </li>`;

        return;

    }

    banners.forEach(banner => {

        const li =
            document.createElement("li");

        li.className = "banner-item";

        const safeTitle =
            escapeHtml(banner.title || "Untitled");

        const safeType =
            escapeHtml(banner.type || "General");

        const safeDate =
            escapeHtml(formatBannerDate(banner.date));

        li.innerHTML =
            `<div class="banner-item-card">
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

    if (bannerUiPositionRaf !== null) {

        return;

    }

    bannerUiPositionRaf =
        window.requestAnimationFrame(() => {

            bannerUiPositionRaf = null;

            positionBannerUi();

        });

}

function positionBannerUi() {

    const btn =
        document.getElementById("addBannerBtn");

    const section =
        document.getElementById("bannerSection");

    if (!btn || !section) {

        return;

    }

    const rail =
        document.querySelector(".map-rail");

    const topbar =
        document.getElementById("topbar");

    const topbarBottom =
        topbar
            ? topbar.getBoundingClientRect().bottom
            : 62;

    const minTop =
        Math.round(topbarBottom + 8);

    let buttonTop =
        Math.round(topbarBottom + 72);

    let rightOffset = 16;

    if (rail) {

        const railRect =
            rail.getBoundingClientRect();

        rightOffset =
            Math.max(
                16,
                Math.round(window.innerWidth - railRect.left + 12)
            );

        // Keep banner controls below the complete right tool rail.
        buttonTop =
            Math.round(railRect.bottom + 12);

    }

    btn.style.right = `${rightOffset}px`;
    section.style.right = `${rightOffset}px`;

    const maxButtonTop =
        Math.max(
            minTop,
            Math.round(window.innerHeight - 64)
        );

    buttonTop =
        Math.max(
            minTop,
            Math.min(buttonTop, maxButtonTop)
        );

    btn.style.top = `${buttonTop}px`;

    const buttonHeight =
        btn.offsetHeight || 42;

    const preferredSectionTop =
        buttonTop + buttonHeight + 10;

    const sectionHeight =
        section.offsetHeight || 220;

    const maxSectionTop =
        Math.max(
            minTop,
            Math.round(window.innerHeight - sectionHeight - 12)
        );

    const sectionTop =
        Math.max(
            minTop,
            Math.min(preferredSectionTop, maxSectionTop)
        );

    section.style.top = `${sectionTop}px`;

}



// ==========================
// Show Banner Details
// ==========================

function showBannerDetails(banner) {

    alert(
        "Banner Details:\n\n" +
        "Title: " + banner.title + "\n" +
        "Type: " + banner.type + "\n" +
        "Date: " + banner.date
    );

}

function formatBannerDate(rawDate) {

    if (!rawDate) {

        return "No date";

    }

    const date =
        new Date(rawDate);

    if (Number.isNaN(date.getTime())) {

        return rawDate;

    }

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