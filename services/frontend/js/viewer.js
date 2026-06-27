/**
 * Image detail page logic.
 *
 * Responsibilities:
 *  - Auth guard
 *  - Fetch image metadata from /file_info/:filename and populate the info panel
 *  - Wire up action buttons: copy URL, download, delete
 *  - Lightbox overlay: open/close, zoom, pan, double-click reset
 *  - Slideshow navigation: prev/next, thumbnail previews, keyboard shortcuts
 *  - Fullscreen mode toggle
 *
 * Depends on lang.js for all user-visible strings via window.t().
 */
(async () => {
  const token = localStorage.getItem("access_token");
  if (!token) {
    location.replace("/index.html");
    return;
  }

  const authFetch = async (url, options = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, ...(options.headers ?? {}) },
    });
    if (response.status === 401) {
      localStorage.removeItem("access_token");
      location.replace("/index.html");
    }
    return response;
  };

  const revealAdminIconIfAdmin = async () => {
    try {
      const res = await authFetch(`${location.origin}/auth/me`);
      if (!res.ok) return;
      const me = await res.json();
      if (me.is_admin)
        document.getElementById("admin-icon-link")?.removeAttribute("hidden");
    } catch {
      /* network failure - icon stays hidden */
    }
  };
  revealAdminIconIfAdmin();

  const SEL = {
    fileNameEl: "#infoFilename",
    fileNameOr: "#infoOriginalName",
    fileNameUn: "#infoUniqueName",
    fileSizeEl: "#infoFileSize",
    fileTypeEl: "#infoFileType",
    fileDateEl: "#infoUploadDate",
    viewerImage: "#imagePreview",
    copyBtn: "#copyUrlBtn",
    downloadBtn: "#downloadBtn",
    deleteBtn: "#deleteBtn",
    viewer: "#image-viewer",
    viewerImg: "#viewer-image",
    viewerContent: ".viewer-content",
    closeBtn: ".close-btn",
    prevBtn: ".prev-btn",
    nextBtn: ".next-btn",
    viewerPrev: "#viewer-prev",
    viewerNext: "#viewer-next",
    fullscreenBtn: ".fullscreen-btn",
  };

  const $ = (s) => document.querySelector(s);

  const urlParts = window.location.pathname.split("/");
  const filename = decodeURIComponent(urlParts[urlParts.length - 1]);

  const fileNameEl = $(SEL.fileNameEl);
  const fileNameOr = $(SEL.fileNameOr);
  const fileNameUn = $(SEL.fileNameUn);
  const fileSizeEl = $(SEL.fileSizeEl);
  const fileTypeEl = $(SEL.fileTypeEl);
  const fileDateEl = $(SEL.fileDateEl);
  const viewerImage = $(SEL.viewerImage);
  const copyBtn = $(SEL.copyBtn);
  const downloadBtn = $(SEL.downloadBtn);
  const deleteBtn = $(SEL.deleteBtn);

  let currentIndex = -1;
  let galleryImages = [];

  try {
    const res = await authFetch(`/file_info/${encodeURIComponent(filename)}`);
    if (!res.ok) throw new Error("File not found");
    const info = await res.json();

    const allImagesRes = await authFetch("/all_images");
    if (!allImagesRes.ok) throw new Error("Failed to load gallery images");
    const data = await allImagesRes.json();

    galleryImages = data.images.map((img) => ({
      src: `${location.origin}/images/${encodeURIComponent(img.unique_name)}`,
      filename: img.unique_name,
    }));

    // Populate info panel
    const mBytes = info.size / (1024 * 1024);
    fileNameEl.textContent = info.filename;
    fileNameOr.textContent = info.original_name;
    fileNameUn.textContent = info.unique_name;
    fileSizeEl.textContent = `${info.size} bytes (${mBytes.toFixed(2)} MB)`;
    fileTypeEl.textContent = info.type.slice(1).toUpperCase();

    const formattedDate = new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
    }).format(new Date(info.upload_date));
    fileDateEl.textContent = formattedDate;
    viewerImage.src = info.url;

    // ---- Action buttons ----

    copyBtn.addEventListener("click", async () => {
      try {
        const fullUrl = info.url.startsWith("http")
          ? info.url
          : `${location.origin}${info.url}`;
        await copyToClipboard(fullUrl);
        copyBtn.querySelector("span").textContent =
          window.t("viewer.copy.copied");
        setTimeout(
          () =>
            (copyBtn.querySelector("span").textContent = window.t(
              "viewer.copy.default",
            )),
          1500,
        );
      } catch (err) {
        alert(window.t("viewer.copy.fail", { error: err }));
      }
    });

    // Re-sync copy button on language change
    window.addEventListener("langchange", () => {
      const span = copyBtn.querySelector("span");
      if (span && span.textContent !== window.t("viewer.copy.copied")) {
        span.textContent = window.t("viewer.copy.default");
      }
    });

    downloadBtn.addEventListener("click", () => {
      const a = document.createElement("a");
      a.href = info.url;
      a.download = info.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    });

    deleteBtn.addEventListener("click", async () => {
      const confirmed = await customConfirm(
        window.t("viewer.delete.body", { name: info.original_name }),
        window.t("viewer.delete.title"),
        {
          confirmText: window.t("viewer.delete.confirm"),
          cancelText: window.t("viewer.delete.cancel"),
          icon: "🗑️",
          iconClass: "warning",
        },
      );
      if (!confirmed) return;

      try {
        const delRes = await authFetch(
          `/upload/${encodeURIComponent(info.unique_name)}`,
          { method: "DELETE" },
        );
        if (!delRes.ok) throw new Error("Delete failed");

        await customAlert(
          window.t("viewer.delete.success.body"),
          window.t("viewer.delete.success.title"),
          {
            icon: "✓",
            iconClass: "success",
          },
        );
        window.location.href = "/upload.html#images";
      } catch (err) {
        await customAlert(
          window.t("viewer.delete.fail.body", { error: err.message }),
          window.t("viewer.delete.fail.title"),
          {
            icon: "✕",
            iconClass: "error",
          },
        );
      }
    });

    // ---- Lightbox ----

    const viewer = $(SEL.viewer);
    const viewerImg = $(SEL.viewerImg);
    const viewerContent = $(SEL.viewerContent);
    const closeBtn = $(SEL.closeBtn);

    let scale = 1,
      translateX = 0,
      translateY = 0;
    let isDragging = false,
      startX = 0,
      startY = 0;

    function openViewer(src) {
      currentIndex = galleryImages.findIndex((img) => img.src === src);
      viewerImg.src = src;
      resetTransform();
      viewer.classList.remove("hidden");
      preloadNeighbors();
    }

    function closeViewer() {
      resetTransform();
      viewer.classList.add("hidden");
      if (document.fullscreenElement) {
        document
          .exitFullscreen()
          .catch((err) => console.error("Error exiting fullscreen:", err));
      }
    }

    viewerImage.addEventListener("click", () => openViewer(viewerImage.src));
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeViewer();
    });

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !viewer.classList.contains("hidden"))
        closeViewer();
    });

    viewer.addEventListener("click", (e) => {
      if (e.target === viewer || e.target === viewerContent) closeViewer();
    });

    viewer.addEventListener(
      "wheel",
      (event) => {
        if (!viewer.classList.contains("hidden")) event.preventDefault();
      },
      { passive: false },
    );

    // ---- Zoom & Pan ----

    function resetTransform() {
      scale = 1;
      translateX = 0;
      translateY = 0;
      applyTransform();
    }

    function applyTransform() {
      viewerImg.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    }

    viewerImg.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        const zoomStep = 0.1;
        scale =
          event.deltaY < 0 ? scale + zoomStep : Math.max(0.1, scale - zoomStep);
        applyTransform();
      },
      { passive: false },
    );

    viewerImg.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;
      isDragging = true;
      startX = event.clientX - translateX;
      startY = event.clientY - translateY;
    });

    window.addEventListener("mousemove", (event) => {
      if (!isDragging) return;
      translateX = event.clientX - startX;
      translateY = event.clientY - startY;
      applyTransform();
    });

    window.addEventListener("mouseup", () => {
      isDragging = false;
    });
    viewerImg.addEventListener("dblclick", resetTransform);

    // ---- Slideshow ----

    const prevBtn = $(SEL.prevBtn);
    const nextBtn = $(SEL.nextBtn);

    prevBtn.addEventListener("click", showPrev);
    nextBtn.addEventListener("click", showNext);

    function showPrev() {
      if (!galleryImages.length) return;
      currentIndex =
        (currentIndex - 1 + galleryImages.length) % galleryImages.length;
      viewerImg.src = galleryImages[currentIndex].src;
      resetTransform();
      preloadNeighbors();
    }

    function showNext() {
      if (!galleryImages.length) return;
      currentIndex = (currentIndex + 1) % galleryImages.length;
      viewerImg.src = galleryImages[currentIndex].src;
      resetTransform();
      preloadNeighbors();
    }

    window.addEventListener("keydown", (event) => {
      if (viewer.classList.contains("hidden")) return;
      if (event.key === "ArrowLeft") showPrev();
      if (event.key === "ArrowRight") showNext();
    });

    // ---- Neighbor previews ----

    const viewerPrev = $(SEL.viewerPrev);
    const viewerNext = $(SEL.viewerNext);

    function preloadNeighbors() {
      viewerPrev.src = "";
      viewerNext.src = "";
      if (!galleryImages.length || galleryImages.length === 1) return;

      const prevIndex =
        (currentIndex - 1 + galleryImages.length) % galleryImages.length;
      if (prevIndex !== currentIndex)
        viewerPrev.src = galleryImages[prevIndex].src;

      const nextIndex = (currentIndex + 1) % galleryImages.length;
      if (nextIndex !== currentIndex)
        viewerNext.src = galleryImages[nextIndex].src;
    }

    viewerPrev.addEventListener("click", () => {
      if (galleryImages.length) showPrev();
    });
    viewerNext.addEventListener("click", () => {
      if (galleryImages.length) showNext();
    });

    // ---- Fullscreen ----

    const fullscreenBtn = $(SEL.fullscreenBtn);
    fullscreenBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFullscreen();
    });

    if (!document.fullscreenEnabled) fullscreenBtn.style.display = "none";

    function toggleFullscreen() {
      if (!document.fullscreenElement) {
        viewer.requestFullscreen().catch((err) => {
          alert(window.t("viewer.fullscreen.error", { error: err.message }));
        });
      } else {
        document.exitFullscreen();
      }
    }

    async function copyToClipboard(text) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.cssText = "position:fixed;opacity:0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        return ok;
      }
    }
  } catch (err) {
    alert(err.message);
  }
})();
