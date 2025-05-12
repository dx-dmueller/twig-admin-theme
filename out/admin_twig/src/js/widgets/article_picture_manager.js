(function($) {
    $.widget("ui.oxArticlePictureManager", {
        _create() {
            this.$form = this.element
            this.productId = this.$form.find('[name="oxid"]').val()
            this.ajaxBaseUrl = this.$form.data("ajax-base-url") || ""
            this.thumbnailId = this.$form.data("thumbnail-id") || ""
            this.iconId = this.$form.data("icon-id") || ""
            this.initialImages = this.$form.data("initial-images") || []
            this.isReadOnly = this.$form.data("readonly") === "true"
            this.imageMap = new Map()
            this._cacheElements()
            if (!this.isReadOnly) {
                this._bindEvents()
                this._initSortables()
            }
            this._initExistingImages()
        },
        _cacheElements() {
            this.$fileInput = this.$form.find("#ap-file-input")
            this.$dropZone = this.$form.find("#ap-dropzone")
            this.$grid = this.$form.find("#ap-grid")
            this.$thumbPlaceholder = this.$form.find("#ap-thumbnail-placeholder")
            this.$iconPlaceholder = this.$form.find("#ap-icon-placeholder")
            this.$errorMessages = this.$form.find("#ap-error-messages")
            this.$closeErrorBtn = this.$form.find("#ap-close-error-btn")
            this.$browseButton = this.$form.find("#ap-browse-button")
            this.$modal = $("#ap-image-modal")
            this.$modalImg = $("#ap-modal-image")
            this.$modalClose = $("#ap-close-modal-btn")
        },
        _initSortables() {
            this.$grid.sortable({
                items: ".ap-item:not([data-status='uploading'])",
                placeholder: "ap-sort-ghost",
                helper: "clone",
                appendTo: "body",
                forcePlaceholderSize: true,
                tolerance: "pointer",
                start: (e, ui) => {
                    ui.item.addClass("ap-dragging")
                },
                stop: (e, ui) => {
                    ui.item.removeClass("ap-dragging")
                },
                over: (e, ui) => {
                    ui.placeholder.appendTo(this.$grid)
                    ui.placeholder.height(ui.helper.outerHeight())
                    ui.placeholder.width(ui.helper.outerWidth())
                },
                update: () => {
                    this._updateSortOrder()
                }
            })
        },
        _bindEvents() {
            this.$closeErrorBtn.on("click", () => {
                this._showError(null)
            })
            this.$modalClose.on("click", () => {
                this._closeModal()
            })
            this.$modal.on("click", (e) => {
                if (e.target === this.$modal[0]) {
                    this._closeModal()
                }
            })
            this.$browseButton.on("click", (e) => {
                e.preventDefault()
                this.$fileInput.click()
            })
            this.$fileInput.on("change", async (e) => {
                if (e.target.files.length) {
                    await this._addFiles(e.target.files)
                }
                this.$fileInput.val("")
            })
            this.$grid.on("click", ".ap-remove-btn", async (e) => {
                e.stopPropagation()
                const fileId = $(e.currentTarget).closest(".ap-item").data("id")
                await this._removeFile(fileId)
            })
            this.$grid.on("click", ".ap-set-cover-btn", async (e) => {
                e.stopPropagation()
                const fileId = $(e.currentTarget).closest(".ap-item").data("id")
                await this._setSpecialImage(fileId, "thumbnail")
            })
            this.$grid.on("click", ".ap-set-icon-btn", async (e) => {
                e.stopPropagation()
                const fileId = $(e.currentTarget).closest(".ap-item").data("id")
                await this._setSpecialImage(fileId, "icon")
            })
            this.$grid.on("click", ".ap-toggle-active-btn", async (e) => {
                e.stopPropagation()
                const fileId = $(e.currentTarget).closest(".ap-item").data("id")
                await this._toggleActive(fileId)
            })
            this.$grid.on("click", ".ap-item", (e) => {
                if ($(e.target).closest("button").length) {
                    return
                }
                const fileId = $(e.currentTarget).data("id")
                const imgObj = this._getImageObj(fileId)
                if (imgObj && imgObj.url) {
                    this._openModal(imgObj.url)
                }
            })
            this._setupFileDrop(this.$dropZone, false, null)
            this._setupFileDrop(this.$thumbPlaceholder, true, "thumbnail")
            this._setupFileDrop(this.$iconPlaceholder, true, "icon")
            this.$thumbPlaceholder.on("click", () => {
                if (this.thumbnailId) {
                    const imgObj = this._getImageObj(this.thumbnailId)
                    if (imgObj && imgObj.url) {
                        this._openModal(imgObj.url)
                    }
                }
            })
            this.$iconPlaceholder.on("click", () => {
                if (this.iconId) {
                    const imgObj = this._getImageObj(this.iconId)
                    if (imgObj && imgObj.url) {
                        this._openModal(imgObj.url)
                    }
                }
            })
        },
        _setupFileDrop(el, isSpecial, specialType) {
            el.on("dragenter dragover", (ev) => {
                ev.preventDefault()
                ev.stopPropagation()
                el.addClass("drag-over")
            })
            el.on("dragleave", (ev) => {
                ev.preventDefault()
                ev.stopPropagation()
                el.removeClass("drag-over")
            })
            el.on("drop", async (ev) => {
                ev.preventDefault()
                ev.stopPropagation()
                el.removeClass("drag-over")
                if (ev.originalEvent.dataTransfer && ev.originalEvent.dataTransfer.files.length) {
                    await this._addFiles(ev.originalEvent.dataTransfer.files, isSpecial ? specialType : null)
                }
            })
        },
        _initExistingImages() {
            this.initialImages
                .sort((a, b) => (a.position || 0) - (b.position || 0))
                .forEach((img) => {
                    const obj = {
                        id: img.id,
                        url: img.url || "",
                        status: "success",
                        active: img.active !== false
                    }
                    this.imageMap.set(img.id, obj)
                    this.$grid.append(this._createItem(obj))
                })
            this._updatePlaceholders()
            this.$grid.find(".ap-item").each((_, el) => {
                const fileId = $(el).data("id")
                const o = this._getImageObj(fileId)
                if (o) {
                    this._updateItem(o)
                }
            })
        },
        _createItem(imgObj) {
            let overlay = ""
            if (!this.isReadOnly) {
                overlay =
                    '<div class="ap-overlay">' +
                    '<div class="ap-top-buttons">' +
                    '<button type="button" class="ap-set-cover-btn">' +
                    '<svg class="ap-icon" viewBox="0 0 24 24">' +
                    '<path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-5-7l-3 3.72L9 13l-3 4h12l-4-5z"/>' +
                    '</svg>' +
                    '</button>' +
                    '<button type="button" class="ap-set-icon-btn">' +
                    '<svg class="ap-icon" viewBox="0 0 24 24">' +
                    '<path d="M17 3H7c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H7V5h10v14zm-2-7H9v5h6v-5z"/>' +
                    '</svg>' +
                    '</button>' +
                    '<button type="button" class="ap-remove-btn">' +
                    '<svg class="ap-icon" viewBox="0 0 24 24">' +
                    '<path d="M16 9v10H8V9h8m-1.5-6h-5l-1 1H5v2h14V4h-3.5l-1-1zM18 7H6v12c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7z"/>' +
                    '</svg>' +
                    '</button>' +
                    '</div>' +
                    '<div class="ap-bottom-button">' +
                    '<button type="button" class="ap-toggle-active-btn">' +
                    '<svg class="ap-icon" viewBox="0 0 24 24">' +
                    '<path d="M17,7A5,5 0 0,1 22,12A5,5 0 0,1 17,17H7A5,5 0 0,1 2,12A5,5 0 0,1 7,7H17M17,15A3,3 0 0,0 20,12A3,3 0 0,0 17,9A3,3 0 0,0 14,12A3,3 0 0,0 17,15Z"/>' +
                    '</svg>' +
                    '</button>' +
                    '</div>' +
                    '</div>'
            }
            return $(
                '<div class="ap-item" data-id="' + imgObj.id + '" ' +
                'data-status="' + imgObj.status + '" ' +
                'data-active="' + (imgObj.active ? "true" : "false") + '">' +
                '<div class="ap-loading-spinner">' +
                '<svg class="ap-spinner-icon" viewBox="0 0 24 24">' +
                '<circle cx="12" cy="12" r="10" fill="none" stroke-width="2" ' +
                'stroke-dasharray="42" stroke-dashoffset="15"></circle>' +
                '</svg>' +
                '</div>' +
                '<img alt="">' +
                overlay +
                '<div class="ap-badge-container"></div>' +
                '</div>'
            )
        },
        _updateItem(obj) {
            const $item = this._getItemEl(obj.id)
            if (!$item.length) return
            $item
                .attr("data-status", obj.status)
                .attr("data-active", obj.active ? "true" : "false")
            if (obj.id === this.thumbnailId) {
                $item.attr("data-cover", "true")
            } else {
                $item.removeAttr("data-cover")
            }
            if (obj.id === this.iconId) {
                $item.attr("data-icon", "true")
            } else {
                $item.removeAttr("data-icon")
            }
            $item.find("img").attr("src", obj.url)
            const $badgeContainer = $item.find(".ap-badge-container")
            $badgeContainer.empty()
            if (obj.id === this.thumbnailId) {
                $badgeContainer.append('<span class="ap-badge thumbnail">Thumb</span>')
            }
            if (obj.id === this.iconId) {
                $badgeContainer.append('<span class="ap-badge icon">Icon</span>')
            }
        },
        _updatePlaceholders() {
            if (this.thumbnailId && this.imageMap.has(this.thumbnailId)) {
                const tObj = this._getImageObj(this.thumbnailId)
                this.$thumbPlaceholder.attr("data-has-image", "true")
                if (!this.$thumbPlaceholder.find("img").length) {
                    this.$thumbPlaceholder.append("<img>")
                }
                this.$thumbPlaceholder.find("img").attr("src", tObj.url)
            } else {
                this.$thumbPlaceholder.removeAttr("data-has-image")
                this.$thumbPlaceholder.find("img").remove()
            }
            if (this.iconId && this.imageMap.has(this.iconId)) {
                const iObj = this._getImageObj(this.iconId)
                this.$iconPlaceholder.attr("data-has-image", "true")
                if (!this.$iconPlaceholder.find("img").length) {
                    this.$iconPlaceholder.append("<img>")
                }
                this.$iconPlaceholder.find("img").attr("src", iObj.url)
            } else {
                this.$iconPlaceholder.removeAttr("data-has-image")
                this.$iconPlaceholder.find("img").remove()
            }
        },
        async _updateSortOrder() {
            const sortedIds = []
            this.$grid.find(".ap-item").each((_, el) => {
                sortedIds.push($(el).data("id"))
            })
            const orderData = {}
            sortedIds.forEach((id, index) => {
                orderData[id] = index
            })
            try {
                const response = await this._request("updateMediaOrder", {
                    productId: this.productId,
                    order: orderData
                })
                if (!response || !response.success) {
                    this._showError(response && response.error ? response.error : "Failed to update sort order")
                }
            } catch (err) {
                this._showError(err.statusText || "Failed to update sort order")
            }
        },
        async _addFiles(fileList, specialType = null) {
            this._showError(null)
            const toUpload = []
            for (const file of fileList) {
                const tempId = "temp_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9)
                const tempObj = { id: tempId, url: "", status: "uploading", active: true }
                this.imageMap.set(tempId, tempObj)
                this.$grid.append(this._createItem(tempObj))
                this._updateItem(tempObj)
                toUpload.push({ file, tempId })
            }
            if (!toUpload.length) return
            try {
                const response = await this._request("addMedia", { productId: this.productId }, toUpload)
                if (!Array.isArray(response)) {
                    for (const item of toUpload) {
                        const obj = this._getImageObj(item.tempId)
                        if (obj) {
                            obj.status = "error"
                            this._updateItem(obj)
                            this._removeImgDOM(item.tempId)
                        }
                    }
                    this._showError("Invalid server response")
                    return
                }
                const items = response
                const uploadErrors = []
                for (const uploadItem of items) {
                    const localObj = this._getImageObj(uploadItem.tempId)
                    if (!localObj) {
                        continue
                    }
                    if (!uploadItem.success || !uploadItem.id) {
                        localObj.status = "error"
                        uploadErrors.push(uploadItem.error ? uploadItem.error : "Upload failed")
                        this._removeImgDOM(uploadItem.tempId)
                    } else {
                        const newObj = {
                            id: uploadItem.id,
                            url: uploadItem.imageUrl || "",
                            status: "success",
                            active: uploadItem.active !== false
                        }
                        this.imageMap.delete(uploadItem.tempId)
                        this.imageMap.set(newObj.id, newObj)
                        const $tempEl = this._getItemEl(uploadItem.tempId)
                        $tempEl.attr("data-id", newObj.id)
                        this._updateItem(newObj)
                        this.$grid.sortable("refresh")
                        if (specialType && newObj.status !== "error") {
                            await this._setSpecialImage(newObj.id, specialType)
                        }
                    }
                }
                if (uploadErrors.length) {
                    this._showError(uploadErrors)
                }
                this._updatePlaceholders()
            } catch (err) {
                for (const item of toUpload) {
                    const obj = this._getImageObj(item.tempId)
                    if (obj) {
                        obj.status = "error"
                        this._updateItem(obj)
                        this._removeImgDOM(item.tempId)
                    }
                }
                this._showError(err.statusText || "Upload failed")
            }
        },
        async _removeFile(fileId) {
            if (!this.imageMap.has(fileId)) return
            const $el = this._getItemEl(fileId)
            $el.fadeOut(150, async () => {
                this._removeImgDOM(fileId)
                try {
                    const response = await this._request("removeMedia", { productMediaId: fileId })
                    if (!response || !response.success) {
                        this._showError(response && response.error ? response.error : "Failed to remove image")
                    }
                } catch (err) {
                    this._showError(err.statusText || "Failed to remove image")
                }
            })
        },
        _removeImgDOM(fileId) {
            this.imageMap.delete(fileId)
            this._getItemEl(fileId).remove()
            if (this.thumbnailId === fileId) {
                this.thumbnailId = ""
            }
            if (this.iconId === fileId) {
                this.iconId = ""
            }
            this._updatePlaceholders()
        },
        async _setSpecialImage(fileId, type) {
            const obj = this._getImageObj(fileId)
            if (!obj || obj.status !== "success") return
            if (type === "thumbnail") {
                if (this.thumbnailId !== fileId) {
                    const oldThumb = this.thumbnailId
                    this.thumbnailId = fileId
                    if (oldThumb && this.imageMap.has(oldThumb)) {
                        this._updateItem(this._getImageObj(oldThumb))
                    }
                }
            } else if (type === "icon") {
                if (this.iconId !== fileId) {
                    const oldIcon = this.iconId
                    this.iconId = fileId
                    if (oldIcon && this.imageMap.has(oldIcon)) {
                        this._updateItem(this._getImageObj(oldIcon))
                    }
                }
            }
            this._updateItem(obj)
            this._updatePlaceholders()
            try {
                let response
                if (type === "thumbnail") {
                    response = await this._request("setProductThumbnail", { productMediaId: fileId })
                } else {
                    response = await this._request("setProductIcon", { productMediaId: fileId })
                }
                if (!response || !response.success) {
                    this._showError(response && response.error ? response.error : "Failed to set special image")
                }
            } catch (err) {
                this._showError(err.statusText || "Failed to set special image")
            }
        },
        async _toggleActive(fileId) {
            const obj = this._getImageObj(fileId)
            if (!obj) return
            const oldActive = obj.active
            obj.active = !obj.active
            this._updateItem(obj)
            try {
                const response = await this._request("updateMediaActiveState", {
                    productMediaId: fileId,
                    active: obj.active ? 1 : 0
                })
                if (!response || !response.success) {
                    obj.active = oldActive
                    this._updateItem(obj)
                    this._showError(response && response.error ? response.error : "Failed to toggle image activity")
                }
            } catch (err) {
                obj.active = oldActive
                this._updateItem(obj)
                this._showError(err.statusText || "Failed to toggle image activity")
            }
        },
        _openModal(imgUrl) {
            this.$modalImg
                .attr("src", imgUrl)
                .off("load error")
                .on("load", () => {
                    this.$modal.addClass("visible")
                })
                .on("error", () => {
                    this._closeModal()
                })
        },
        _closeModal() {
            this.$modal.removeClass("visible")
            setTimeout(() => {
                if (!this.$modal.hasClass("visible")) {
                    this.$modalImg.attr("src", "")
                }
            }, 150)
        },
        async _request(fnc, data = {}, files = []) {
            const formData = new FormData()
            formData.append("fnc", fnc)
            if (data.productId) {
                formData.append("productId", data.productId)
            }
            if (files.length) {
                for (const f of files) {
                    formData.append("uploadedFiles[]", f.file)
                    if (f.tempId) {
                        formData.append("tempIds[]", f.tempId)
                    }
                }
            }
            for (const key in data) {
                if (key !== "productId") {
                    if (typeof data[key] === "object") {
                        formData.append(key, JSON.stringify(data[key]))
                    } else {
                        formData.append(key, data[key])
                    }
                }
            }
            return $.ajax({
                url: this.ajaxBaseUrl,
                type: "POST",
                data: formData,
                processData: false,
                contentType: false,
                dataType: "json"
            })
        },
        _getItemEl(id) {
            return this.$grid.find('.ap-item[data-id="' + id + '"]')
        },
        _getImageObj(id) {
            return this.imageMap.has(id) ? this.imageMap.get(id) : null
        },
        _showError(err) {
            this.$errorMessages.find("ul").remove()
            if (!err) {
                this.$errorMessages.hide()
                return
            }
            const errors = Array.isArray(err) ? err : [err]
            const $ul = $("<ul>")
            errors.forEach((msg) => {
                $("<li>").text(msg).appendTo($ul)
            })
            this.$errorMessages.append($ul).show()
        }
    })
})(jQuery)
