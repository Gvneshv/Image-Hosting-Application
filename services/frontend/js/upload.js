/**
 * Image-host frontend logic
 * - Auth guard: redirects unauthenticated visitors to index.html
 * - Account icon: fetches initials from GET /auth/me and populates the account icon
 * - Upload via button or drag-&-drop
 * - List uploaded images with pagination and sorting
 * - Delete images
 *
 * Depends on lang.js for all user-visible strings via window.t().
 * Re-renders dynamic controls on "langchange" events dispatched by lang.js.
 */
(async () => {
  /* --------------------------------------------------------------------
   *  AUTH GUARD
   * ------------------------------------------------------------------ */
  const token = localStorage.getItem("access_token");
  if (!token) {
    location.replace("index.html");
  }

  /* --------------------------------------------------------------------
   *  ACCOUNT ICON - populate initials from the JWT email claim
   * ------------------------------------------------------------------ */
  (() => {
    try {
      const payload = JSON.parse(
        atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
      );
      const email = payload?.sub ?? payload?.email ?? "";
      if (!email) return;

      const parts = email
        .split("@")[0]
        .split(/[^a-zA-Z]+/)
        .filter(Boolean);
      const initials = parts
        .slice(0, 2)
        .map((p) => p[0].toUpperCase())
        .join("");
      if (!initials) return;

      const iconEl = document.getElementById("account-icon");
      if (!iconEl) return;
      iconEl.textContent = initials;
      iconEl.setAttribute("aria-label", email);
    } catch {
      // Malformed token - leave the default SVG in place.
    }
  })();

  /* --------------------------------------------------------------------
   *  ADMIN ICON - reveal for admins only (server-authoritative)
   * ------------------------------------------------------------------ */
  const revealAdminIconIfAdmin = async () => {
    try {
      const res = await authFetch(`${location.origin}/auth/me`);
      if (!res.ok) return;
      const me = await res.json();
      if (me.is_admin) {
        document.getElementById("admin-icon-link")?.removeAttribute("hidden");
      }
    } catch {
      // Network failure - icon stays hidden.
    }
  };

  /* --------------------------------------------------------------------
   *  AUTH FETCH HELPER
   * ------------------------------------------------------------------ */
  const authFetch = async (url, options = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.headers ?? {}),
      },
    });

    if (response.status === 401) {
      localStorage.removeItem("access_token");
      location.replace("index.html");
    }

    return response;
  };

  /* --------------------------------------------------------------------
   *  CONSTANTS
   * ------------------------------------------------------------------ */
  const API_UPLOAD_URL = `${location.origin}/upload/`;
  const API_IMAGES_URL = `${location.origin}/upload`;
  const API_DELETE_URL = (fn) =>
    `${location.origin}/upload/${encodeURIComponent(fn)}`;

  const SEL = {
    uploadBtn: "#browse-button",
    fileInput: "#fileInput",
    resultInput: "#resultLink",
    copyBtn: ".copyBtn",
    uploadText: ".upload-main-text, .upload-error",
    uploadArea: "#uploadArea",
    imgSection: "#images-tab",
    table: ".hidden-table",
    imgTabBtn: '.toggle-tab[data-tab="images"]',
  };

  const $ = (s) => document.querySelector(s);

  /**
   * Display a status message in the upload text area.
   * @param {HTMLElement} el
   * @param {string} msg
   * @param {boolean} [isErr=false]
   */
  const showStatus = (el, msg, isErr = false) => {
    el.classList.toggle("upload-error", isErr);
    el.classList.toggle("upload-main-text", !isErr);
    el.textContent = msg;
  };

  /**
   * Create a paragraph element for status/empty-state messages.
   * @param {string} txt
   * @param {string} [col='#555']
   * @returns {HTMLParagraphElement}
   */
  const createMsg = (txt, col = "#555") => {
    const p = document.createElement("p");
    p.textContent = txt;
    p.className = "no-images-msg";
    p.style.cssText = `text-align:center;color:${col}`;
    return p;
  };

  /* --------------------------------------------------------------------
   *  UPLOADER
   * ------------------------------------------------------------------ */
  /**
   * Initialise upload functionality (file input, drag-drop, copy button).
   * @param {() => void} loadImages - Callback to refresh the image gallery after a successful upload.
   */
  function initUploader(loadImages) {
    const uploadBtn = $(SEL.uploadBtn);
    const fileInput = $(SEL.fileInput);
    const resultInput = $(SEL.resultInput);
    const copyBtn = $(SEL.copyBtn);
    const uploadText = $(SEL.uploadText);
    const uploadArea = $(SEL.uploadArea);

    if (
      !uploadBtn ||
      !fileInput ||
      !resultInput ||
      !copyBtn ||
      !uploadText ||
      !uploadArea
    )
      return;

    const allowedTypes = ["image/jpeg", "image/png", "image/gif"];
    const maxSize = 5 * 1024 * 1024;

    /**
     * Upload a single file to the server.
     * @param {File} file
     */
    const uploadFile = async (file) => {
      if (file.type && !allowedTypes.includes(file.type)) {
        showStatus(uploadText, window.t("upload.error.type"), true);
        return;
      }
      if (file.size > maxSize) {
        const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
        showStatus(
          uploadText,
          window.t("upload.error.size_client", { size: sizeMB }),
          true,
        );
        return;
      }

      showStatus(uploadText, window.t("upload.status.uploading"), false);

      try {
        const form = new FormData();
        form.append("file", file);

        const response = await authFetch(API_UPLOAD_URL, {
          method: "POST",
          body: form,
        });

        if (response.status === 413) {
          showStatus(uploadText, window.t("upload.error.size_server"), true);
          return;
        }

        if (response.status === 400) {
          try {
            const error = await response.json();
            showStatus(
              uploadText,
              `${window.t("upload.error.invalid")}: ${error.detail}`,
              true,
            );
          } catch {
            showStatus(uploadText, window.t("upload.error.invalid"), true);
          }
          return;
        }

        if (response.status === 429) {
          showStatus(uploadText, window.t("upload.error.rate_limit"), true);
          return;
        }

        if (!response.ok) {
          showStatus(
            uploadText,
            window.t("upload.error.server", { status: response.status }),
            true,
          );
          return;
        }

        const result = await response.json();
        showStatus(
          uploadText,
          window.t("upload.status.success") + result.filename,
        );

        loadImages();

        const imageUrl = result.url.startsWith("http")
          ? result.url
          : `${location.origin}${result.url}`;
        resultInput.value = imageUrl;
      } catch (e) {
        console.error("Upload error:", e);
        showStatus(
          uploadText,
          window.t("upload.error.server", { status: e.message }),
          true,
        );
      }
    };

    fileInput.addEventListener("change", () => {
      const file = fileInput.files[0];
      if (file) uploadFile(file);
      fileInput.value = "";
    });

    copyBtn.addEventListener("click", async () => {
      if (!resultInput.value) return;
      try {
        await copyToClipboard(resultInput.value);
        copyBtn.textContent = window.t("upload.copy.copied");
        setTimeout(
          () => (copyBtn.textContent = window.t("upload.copy.default")),
          1500,
        );
      } catch (err) {
        alert(window.t("upload.gallery.fail_copy", { error: err.message }));
      }
    });

    // Re-sync copy button label on language change in case it's showing "Copied!"
    window.addEventListener("langchange", () => {
      // Only reset if not in "Copied" state (i.e. value is truthy from the timeout)
      if (copyBtn.textContent !== window.t("upload.copy.copied")) {
        copyBtn.textContent = window.t("upload.copy.default");
      }
    });

    const prevent = (e) => e.preventDefault();
    ["dragenter", "dragover", "dragleave", "drop"].forEach((ev) =>
      uploadArea.addEventListener(ev, prevent, false),
    );

    uploadArea.addEventListener("dragenter", () =>
      uploadArea.classList.add("dragover"),
    );
    uploadArea.addEventListener("dragover", () =>
      uploadArea.classList.add("dragover"),
    );
    uploadArea.addEventListener("dragleave", () =>
      uploadArea.classList.remove("dragover"),
    );
    uploadArea.addEventListener("drop", (e) => {
      uploadArea.classList.remove("dragover");
      const file = e.dataTransfer.files[0];
      if (file) uploadFile(file);
    });
  }

  /* --------------------------------------------------------------------
   *  IMAGES TAB
   * ------------------------------------------------------------------ */
  /**
   * Initialise the Images tab: per-page/sort controls, image grid, pagination.
   * Listens for "langchange" to rebuild injected controls with updated strings.
   * @returns {{ loadImages: () => void }}
   */
  function initImagesTab() {
    const imgSection = $(SEL.imgSection);
    const table = $(SEL.table);
    const imgTabBtn = $(SEL.imgTabBtn);

    if (!imgSection || !table || !imgTabBtn) return { loadImages: () => {} };

    let currentPage = 1;
    let per_page = 6;
    let totalPages = 1;
    let hasLoadedOnce = false;
    let sort_by = "upload_time";
    let sort_order = "desc";

    // ---- Build controls ----

    /**
     * Inject (or re-inject) the per-page / sort controls using current language strings.
     * Called on first init and again on every "langchange" event.
     */
    const buildControls = () => {
      // Preserve current select values before rebuilding
      const prevPerPage =
        table.querySelector("#perPageSelect")?.value ?? String(per_page);
      const prevSortField = table.querySelector("#sortField")?.value ?? sort_by;
      const prevSortOrder =
        table.querySelector("#sortOrder")?.value ?? sort_order;

      table.innerHTML = ""; // clear old controls

      const perPageControls = document.createElement("div");
      perPageControls.className = "perpage-controls";
      perPageControls.innerHTML = `
        <label>
          ${window.t("controls.per_page")}
          <select id="perPageSelect">
            <option value="3">3</option>
            <option value="6">6</option>
            <option value="9">9</option>
          </select>
        </label>
        <label>${window.t("controls.sort_by")}
          <select id="sortField">
            <option value="upload_time">${window.t("controls.sort.time")}</option>
            <option value="filename">${window.t("controls.sort.name")}</option>
            <option value="size">${window.t("controls.sort.size")}</option>
          </select>
        </label>
        <label>${window.t("controls.order")}
          <select id="sortOrder">
            <option value="asc">${window.t("controls.order.asc")}</option>
            <option value="desc">${window.t("controls.order.desc")}</option>
          </select>
        </label>
      `;
      table.appendChild(perPageControls);

      // Restore previous values
      perPageControls.querySelector("#perPageSelect").value = prevPerPage;
      perPageControls.querySelector("#sortField").value = prevSortField;
      perPageControls.querySelector("#sortOrder").value = prevSortOrder;

      // Wire up change handlers
      perPageControls
        .querySelector("#perPageSelect")
        .addEventListener("change", (e) => {
          per_page = parseInt(e.target.value);
          currentPage = 1;
          loadImages();
        });
      perPageControls
        .querySelector("#sortField")
        .addEventListener("change", (e) => {
          sort_by = e.target.value;
          currentPage = 1;
          loadImages();
        });
      perPageControls
        .querySelector("#sortOrder")
        .addEventListener("change", (e) => {
          sort_order = e.target.value;
          currentPage = 1;
          loadImages();
        });
    };

    buildControls();

    // ---- Build pagination ----
    const paginationContainer = document.createElement("div");
    paginationContainer.className = "pagination-container";
    imgSection.appendChild(paginationContainer);

    /**
     * Re-render the pagination row with translated button labels and current page info.
     */
    const renderPagination = () => {
      paginationContainer.innerHTML = `
        <button id="prevBtn">${window.t("controls.prev")}</button>
        <span id="pageInfo">${window.t("upload.page_info", { current: currentPage, total: totalPages })}</span>
        <button id="nextBtn">${window.t("controls.next")}</button>
      `;
      const prevBtn = paginationContainer.querySelector("#prevBtn");
      const nextBtn = paginationContainer.querySelector("#nextBtn");

      prevBtn.disabled = currentPage <= 1;
      nextBtn.disabled = currentPage >= totalPages;

      prevBtn.addEventListener("click", () => {
        if (currentPage > 1) {
          currentPage--;
          loadImages();
        }
      });
      nextBtn.addEventListener("click", () => {
        if (currentPage < totalPages) {
          currentPage++;
          loadImages();
        }
      });
    };

    // ---- Empty / loaded state helpers ----

    const showEmptyState = () => {
      table.style.display = "none";
      paginationContainer.style.display = "none";
      imgSection.querySelectorAll(".no-images-msg").forEach((n) => n.remove());
      imgSection.appendChild(createMsg(window.t("upload.gallery.empty")));
    };

    const showLoadedState = () => {
      table.style.display = "";
      paginationContainer.style.display = "flex";
    };

    // ---- Delete ----

    /**
     * Confirm and delete an image by unique_name, removing its cell from the DOM.
     * @param {string} filename
     * @param {HTMLElement} cell
     */
    const deleteImage = async (filename, cell) => {
      const confirmed = await customConfirm(
        window.t("dialog.delete.body"),
        window.t("dialog.delete.title"),
        {
          confirmText: window.t("dialog.delete.confirm"),
          cancelText: window.t("dialog.delete.cancel"),
          icon: "🗑️",
          iconClass: "warning",
        },
      );

      if (!confirmed) return;

      try {
        const response = await authFetch(API_DELETE_URL(filename), {
          method: "DELETE",
        });
        if (!response.ok) throw new Error("Delete failed");
        cell.remove();
        if (!table.querySelector(".image-element")) showEmptyState();
      } catch (e) {
        await customAlert(
          window.t("upload.gallery.fail_delete", { error: e.message }),
          window.t("dialog.delete_err.title"),
          {
            icon: "✕",
            iconClass: "error",
          },
        );
      }
    };

    // ---- Load & render ----

    /**
     * Fetch the current page of images from the server and render them.
     */
    const loadImages = async () => {
      table.querySelectorAll(".image-element").forEach((n) => n.remove());
      imgSection.querySelectorAll(".no-images-msg").forEach((n) => n.remove());

      try {
        const response = await authFetch(
          `${API_IMAGES_URL}?page=${currentPage}&per_page=${per_page}&sort_by=${sort_by}&sort_order=${sort_order}`,
        );

        if (response.status === 404) {
          showEmptyState();
          hasLoadedOnce = true;
          return;
        }
        if (!response.ok) {
          showEmptyState();
          return;
        }

        const result = await response.json();
        const images = result.images;
        totalPages = result.pages;

        if (!images || !images.length) {
          showEmptyState();
          hasLoadedOnce = true;
          return;
        }

        showLoadedState();
        hasLoadedOnce = true;

        images.forEach(({ filename, unique_name }) => {
          const imageUrl = `/images/${unique_name}`;
          const cell = document.createElement("div");
          cell.className = "image-element";
          cell.innerHTML = `
            <div class="image" data-filename="${filename}" style="background-image: url(${imageUrl});" alt="${filename}">
              <button class="new-tab"></button>
            </div>
            <div class="image-beneath">
              <div class="image-buttons-container">
                <button class="copy-button copyBtn">${window.t("upload.gallery.copy")}</button>
                <button class="delete-button">🗑️</button>
              </div>
            </div>`;

          cell
            .querySelector(".delete-button")
            .addEventListener("click", () => deleteImage(unique_name, cell));

          const parent = cell.querySelector(".image");
          parent.addEventListener("click", () => {
            window.location.href = `/view/${encodeURIComponent(unique_name)}`;
          });

          const child = parent.querySelector(".new-tab");
          if (child) {
            child.addEventListener("click", (event) => {
              event.stopPropagation();
              window.open(`/view/${encodeURIComponent(unique_name)}`, "_blank");
            });
          }

          const copyBtn = cell.querySelector(".copyBtn");
          copyBtn?.addEventListener("click", async (event) => {
            event.stopPropagation();
            const url = `${location.origin}/images/${encodeURIComponent(unique_name)}`;
            try {
              await copyToClipboard(url);
              copyBtn.textContent = window.t("upload.gallery.copied");
              setTimeout(
                () => (copyBtn.textContent = window.t("upload.gallery.copy")),
                1500,
              );
            } catch (err) {
              alert(window.t("upload.gallery.fail_copy", { error: err }));
            }
          });

          table.appendChild(cell);
        });

        renderPagination();
      } catch (e) {
        console.error("Images load error:", e);
        showEmptyState();
      }
    };

    // Rebuild controls (translated labels) and refresh pagination text on language change
    window.addEventListener("langchange", () => {
      buildControls();
      if (hasLoadedOnce) renderPagination();
      // Refresh "No images yet." message if visible
      const emptyMsg = imgSection.querySelector(".no-images-msg");
      if (emptyMsg) emptyMsg.textContent = window.t("upload.gallery.empty");
    });

    imgTabBtn.addEventListener("click", () => {
      if (
        !hasLoadedOnce ||
        table.querySelectorAll(".image-element").length === 0
      ) {
        loadImages();
      }
    });

    if (imgTabBtn.classList.contains("active")) loadImages();

    return { loadImages };
  }

  /* --------------------------------------------------------------------
   *  CLIPBOARD HELPER
   * ------------------------------------------------------------------ */
  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback for HTTP / older browsers
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

  // Init
  const { loadImages } = initImagesTab();
  initUploader(loadImages);
  revealAdminIconIfAdmin();
})();
