/**
 * Image detail page logic.
 *
 * Responsibilities:
 *  - Fetch image metadata from /file_info/:filename and populate the info panel
 *  - Wire up action buttons: copy URL, download, delete
 *  - Lightbox overlay: open/close, zoom (mouse wheel), pan (drag), double-click reset
 *  - Slideshow navigation: previous / next via arrow buttons, thumbnail previews,
 *    and keyboard shortcuts (← →)
 *  - Fullscreen mode toggle
 *  - Close on ESC or by clicking the dark overlay background
 */
(async () => {

    /** CSS selector map — centralises all querySelector strings. */
    const SEL = {
        fileNameEl:     '#infoFilename',
        fileNameOr:     '#infoOriginalName',
        fileNameUn:     '#infoUniqueName',
        fileSizeEl:     '#infoFileSize',
        fileTypeEl:     '#infoFileType',
        fileDateEl:     '#infoUploadDate',
        viewerImage:    '#imagePreview',
        copyBtn:        '#copyUrlBtn',
        downloadBtn:    '#downloadBtn',
        deleteBtn:      '#deleteBtn',
        back:           '#back',
        viewer:         '#image-viewer',
        viewerImg:      '#viewer-image',
        viewerContent:  '.viewer-content',   // wrapper around main image + neighbors
        closeBtn:       '.close-btn',
        prevBtn:        '.prev-btn',
        nextBtn:        '.next-btn',
        viewerPrev:     '#viewer-prev',
        viewerNext:     '#viewer-next',
        fullscreenBtn:  '.fullscreen-btn',
    };

    /** Shorthand for document.querySelector. */
    const $ = (s) => document.querySelector(s);

    // -----------------------------------------------------------------------
    // Resolve the current filename from the URL path
    // -----------------------------------------------------------------------
    const urlParts = window.location.pathname.split('/');
    const filename = decodeURIComponent(urlParts[urlParts.length - 1]);

    // Cache DOM references
    const fileNameEl  = $(SEL.fileNameEl);
    const fileNameOr  = $(SEL.fileNameOr);
    const fileNameUn  = $(SEL.fileNameUn);
    const fileSizeEl  = $(SEL.fileSizeEl);
    const fileTypeEl  = $(SEL.fileTypeEl);
    const fileDateEl  = $(SEL.fileDateEl);
    const viewerImage = $(SEL.viewerImage);
    const copyBtn     = $(SEL.copyBtn);
    const downloadBtn = $(SEL.downloadBtn);
    const deleteBtn   = $(SEL.deleteBtn);
    const back        = $(SEL.back);

    // Slideshow state
    let currentIndex  = -1;
    let galleryImages = [];   // [{ src: string, filename: string }]

    try {
        // -----------------------------------------------------------------------
        // Fetch metadata for this image
        // -----------------------------------------------------------------------
        const res = await fetch(`/file_info/${encodeURIComponent(filename)}`);
        if (!res.ok) throw new Error('File not found');
        const info = await res.json();

        // -----------------------------------------------------------------------
        // Fetch all gallery images for the slideshow
        // -----------------------------------------------------------------------
        const allImagesRes = await fetch('/all_images');
        if (!allImagesRes.ok) throw new Error('Failed to load gallery images');
        const data = await allImagesRes.json();

        // Build absolute URLs so index lookups always match (avoids relative vs absolute mismatch)
        galleryImages = data.images.map(img => ({
            src: `${location.origin}/images/${encodeURIComponent(img.unique_name)}`,
            filename: img.unique_name,
        }));

        // -----------------------------------------------------------------------
        // Populate info panel
        // -----------------------------------------------------------------------
        const mBytes = info.size / (1024 * 1024);
        fileNameEl.textContent = info.filename;
        fileNameOr.textContent = info.original_name;
        fileNameUn.textContent = info.unique_name;
        fileSizeEl.textContent = `${info.size} bytes (${mBytes.toFixed(2)} MB)`;
        fileTypeEl.textContent = info.type.slice(1).toUpperCase();

        const formattedDate = new Intl.DateTimeFormat(undefined, {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            timeZoneName: 'short',
        }).format(new Date(info.upload_date));
        fileDateEl.textContent = formattedDate;

        viewerImage.src = info.url;

        // -----------------------------------------------------------------------
        // Action buttons
        // -----------------------------------------------------------------------

        back.addEventListener('click', () => {
            window.location.href = '/upload.html';
        });

        copyBtn.addEventListener('click', async () => {
            try {
                const fullUrl = info.url.startsWith('http')
                    ? info.url
                    : `${location.origin}${info.url}`;
                await copyToClipboard(fullUrl);
                copyBtn.textContent = 'COPIED';
                setTimeout(() => (copyBtn.textContent = 'COPY URL'), 1500);
            } catch (err) {
                alert(`Copy failed: ${err}`);
            }
        });

        downloadBtn.addEventListener('click', () => {
            const a = document.createElement('a');
            a.href = info.url;
            a.download = info.filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
        });

        deleteBtn.addEventListener('click', async () => {
            const confirmed = await customConfirm(
                `Are you sure you want to delete "${info.original_name}"? This action cannot be undone.`,
                'Delete Image',
                { confirmText: 'Delete', cancelText: 'Cancel', icon: '🗑️', iconClass: 'warning' }
            );
            if (!confirmed) return;

            try {
                const delRes = await fetch(`/upload/${encodeURIComponent(info.unique_name)}`, {
                    method: 'DELETE',
                });
                if (!delRes.ok) throw new Error('Delete failed');

                await customAlert('Image deleted successfully!', 'Deleted', {
                    icon: '✓', iconClass: 'success',
                });
                window.location.href = '/upload.html';
            } catch (err) {
                await customAlert(`Delete failed: ${err.message}`, 'Error', {
                    icon: '✕', iconClass: 'error',
                });
            }
        });

        // -----------------------------------------------------------------------
        // Lightbox — open / close
        // -----------------------------------------------------------------------
        const viewer       = $(SEL.viewer);
        const viewerImg    = $(SEL.viewerImg);
        const viewerContent = $(SEL.viewerContent);
        const closeBtn     = $(SEL.closeBtn);

        let scale = 1;
        let translateX = 0, translateY = 0;
        let isDragging = false;
        let startX = 0, startY = 0;

        /** Open the lightbox showing the given image src. */
        function openViewer(src) {
            currentIndex = galleryImages.findIndex(img => img.src === src);
            viewerImg.src = src;
            resetTransform();
            viewer.classList.remove('hidden');
            preloadNeighbors();
        }

        /** Close the lightbox and exit fullscreen if active. */
        function closeViewer() {
            resetTransform();
            viewer.classList.add('hidden');
            if (document.fullscreenElement) {
                document.exitFullscreen().catch(err => {
                    console.error('Error exiting fullscreen:', err);
                });
            }
        }

        // Open viewer when clicking the inline preview image
        viewerImage.addEventListener('click', () => openViewer(viewerImage.src));

        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeViewer();
        });

        // Close on ESC
        window.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && !viewer.classList.contains('hidden')) {
                closeViewer();
            }
        });

        // Close when clicking the dark background (but not the image or controls)
        viewer.addEventListener('click', (e) => {
            if (e.target === viewer || e.target === viewerContent) {
                closeViewer();
            }
        });

        // Prevent background page scroll while the overlay is open
        viewer.addEventListener('wheel', (event) => {
            if (!viewer.classList.contains('hidden')) {
                event.preventDefault();
            }
        }, { passive: false });

        // -----------------------------------------------------------------------
        // Zoom & Pan
        // -----------------------------------------------------------------------
        function resetTransform() {
            scale = 1;
            translateX = 0;
            translateY = 0;
            applyTransform();
        }

        function applyTransform() {
            viewerImg.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
        }

        // Zoom with mouse wheel
        viewerImg.addEventListener('wheel', (event) => {
            event.preventDefault();
            const zoomStep = 0.1;
            scale = event.deltaY < 0
                ? scale + zoomStep
                : Math.max(0.1, scale - zoomStep);
            applyTransform();
        }, { passive: false });

        // Drag to pan
        viewerImg.addEventListener('mousedown', (event) => {
            if (event.button !== 0) return;
            isDragging = true;
            startX = event.clientX - translateX;
            startY = event.clientY - translateY;
        });

        window.addEventListener('mousemove', (event) => {
            if (!isDragging) return;
            translateX = event.clientX - startX;
            translateY = event.clientY - startY;
            applyTransform();
        });

        window.addEventListener('mouseup', () => {
            isDragging = false;
        });

        // Double-click resets zoom and position
        viewerImg.addEventListener('dblclick', resetTransform);

        // -----------------------------------------------------------------------
        // Slideshow navigation
        // -----------------------------------------------------------------------
        const prevBtn = $(SEL.prevBtn);
        const nextBtn = $(SEL.nextBtn);

        prevBtn.addEventListener('click', showPrev);
        nextBtn.addEventListener('click', showNext);

        function showPrev() {
            if (!galleryImages.length) return;
            currentIndex = (currentIndex - 1 + galleryImages.length) % galleryImages.length;
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

        // Keyboard navigation — only active when the lightbox is open
        window.addEventListener('keydown', (event) => {
            if (viewer.classList.contains('hidden')) return;
            if (event.key === 'ArrowLeft')  showPrev();
            if (event.key === 'ArrowRight') showNext();
        });

        // -----------------------------------------------------------------------
        // Neighbor previews (thumbnails shown at bottom-left / bottom-right)
        // -----------------------------------------------------------------------
        const viewerPrev = $(SEL.viewerPrev);
        const viewerNext = $(SEL.viewerNext);

        /** Preload and display the adjacent images as clickable thumbnails. */
        function preloadNeighbors() {
            viewerPrev.src = '';
            viewerNext.src = '';
            if (!galleryImages.length || galleryImages.length === 1) return;

            const prevIndex = (currentIndex - 1 + galleryImages.length) % galleryImages.length;
            if (prevIndex !== currentIndex) {
                viewerPrev.src = galleryImages[prevIndex].src;
            }

            const nextIndex = (currentIndex + 1) % galleryImages.length;
            if (nextIndex !== currentIndex) {
                viewerNext.src = galleryImages[nextIndex].src;
            }
        }

        viewerPrev.addEventListener('click', () => { if (galleryImages.length) showPrev(); });
        viewerNext.addEventListener('click', () => { if (galleryImages.length) showNext(); });

        // -----------------------------------------------------------------------
        // Fullscreen
        // -----------------------------------------------------------------------
        const fullscreenBtn = $(SEL.fullscreenBtn);
        fullscreenBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFullscreen();
        });

        if (!document.fullscreenEnabled) {
            fullscreenBtn.style.display = 'none';
        }

        function toggleFullscreen() {
            if (!document.fullscreenElement) {
                viewer.requestFullscreen().catch(err => {
                    alert(`Fullscreen error: ${err.message}`);
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
                // Fallback for HTTP / older browsers
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.cssText = 'position:fixed;opacity:0';
                document.body.appendChild(ta);
                ta.focus();
                ta.select();
                const ok = document.execCommand('copy');
                ta.remove();
                return ok;
            }
        }

    } catch (err) {
        alert(err.message);
    }
})();
