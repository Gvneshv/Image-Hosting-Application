/**
 * Language toggle for the Image Hosting Application.
 * Supports English (en) and Ukrainian (uk).
 *
 * HOW IT WORKS
 * ------------
 * 1. On load, reads the saved language from localStorage ("lang" key).
 *    Defaults to "en" if nothing is saved.
 * 2. Calls applyLang(), which walks every [data-i18n] element in the DOM and sets its textContent to the matching string from STRINGS[lang].
 * 3. Dispatches a custom "langchange" event on window so that JS modules that inject strings dynamically (upload.js, viewer.js, admin.js, etc.)
 *    can re-render without this file needing to know their internals.
 * 4. Wires up any element with id="lang-toggle" as the toggle button.
 *    The button label shows the *other* language code (the one to switch to).
 *
 * TOKEN SUBSTITUTION
 * ------------------
 * t("key", { name: "foo" }) replaces {name} in the string with "foo".
 * This covers dynamic values like filenames, counts, emails, etc.
 *
 * ADDING A NEW PAGE
 * -----------------
 * - Add data-i18n="key" to every translatable element in the HTML.
 * - Add the key to both en and uk blocks below.
 * - Add <script src="[../]js/lang.js" defer></script> to the page <head>.
 * - Add a lang-toggle button next to the theme-toggle button.
 *
 * STORAGE
 * -------
 * localStorage key : "lang"
 * Values           : "en" | "uk" (absent = "en")
 */

"use strict";

// ---------------------------------------------------------------------------
// String catalog
// ---------------------------------------------------------------------------

/**
 * All UI strings keyed by language code, then by string key.
 *
 * uk values not yet translated use the English string prefixed with "TRANSLATE_ME: " so they are visually obvious during development
 * but the UI still works (t() falls back to en for missing keys anyway).
 */
const STRINGS = {
  en: {
    // ---- Shared / reused ----
    "modal.btn.ok": "OK",
    "modal.btn.cancel": "Cancel",

    // ---- Shared header (upload, viewer) ----
    "header.subtitle": "Upload selfies, memes, or any fun pictures here.",
    "header.aria.theme.to_dark": "Switch to dark theme",
    "header.aria.theme.to_light": "Switch to light theme",
    "header.aria.admin": "Admin Panel",
    "header.aria.account": "My Account",

    // ---- upload.html static ----
    "upload.tab.upload": "Upload",
    "upload.tab.images": "Images",
    "upload.pad.main": "Select a file or drag and drop here",
    "upload.pad.sub":
      "Only support .jpg, .jpeg, .png, and gif.\nMaximum file size is 5MB",
    "upload.browse": "Browse your file",
    "upload.url.title": "Current Upload",
    "upload.url.copy": "Copy",

    // ---- upload.js dynamic ----
    "upload.status.uploading": "Uploading...",
    "upload.status.success": "File uploaded: ",
    "upload.error.type":
      "Upload failed: Only JPG, PNG, and GIF files are allowed.",
    "upload.error.size_client": "File is {size}MB. Maximum size is 5MB.",
    "upload.error.size_server":
      "Upload failed: File is too large. Maximum size is 5MB.",
    "upload.error.invalid": "Upload failed: Invalid file",
    "upload.error.rate_limit":
      "Upload failed: Too many uploads. Please wait a minute and try again.",
    "upload.error.server": "Upload failed: Server error ({status})",
    "upload.copy.copied": "Copied!",
    "upload.copy.default": "COPY",
    "upload.gallery.copy": "COPY",
    "upload.gallery.copied": "COPIED",
    "upload.gallery.empty": "No images yet.",
    "upload.gallery.fail_copy": "Failed to copy URL: {error}",
    "upload.gallery.fail_delete": "Failed to delete: {error}",
    "upload.page_info": "Page {current} of {total}",

    // ---- Controls injected by upload.js ----
    "controls.per_page": "Per page:",
    "controls.sort_by": "Sort by:",
    "controls.order": "Order:",
    "controls.sort.time": "Upload Time",
    "controls.sort.name": "Filename",
    "controls.sort.size": "Size",
    "controls.order.asc": "Ascending",
    "controls.order.desc": "Descending",
    "controls.prev": "Previous",
    "controls.next": "Next",

    // ---- Delete confirm dialog (upload.js via modal.js) ----
    "dialog.delete.title": "Delete Image",
    "dialog.delete.body":
      "Are you sure you want to delete this image? This action cannot be undone.",
    "dialog.delete.confirm": "Delete",
    "dialog.delete.cancel": "Cancel",
    "dialog.delete_err.title": "Error",

    // ---- viewer.html static ----
    "viewer.page_title": "Image Details",
    "viewer.label.filename": "Full Filename:",
    "viewer.label.original_name": "Original Name:",
    "viewer.label.unique_name": "Unique Name:",
    "viewer.label.size": "File Size:",
    "viewer.label.type": "File Type:",
    "viewer.label.date": "Upload Date:",
    "viewer.btn.copy_url": "Copy URL",
    "viewer.btn.download": "Download",
    "viewer.btn.delete": "Delete",

    // ---- viewer.js dynamic ----
    "viewer.copy.copied": "COPIED",
    "viewer.copy.default": "COPY URL",
    "viewer.copy.fail": "Copy failed: {error}",
    "viewer.delete.title": "Delete Image",
    "viewer.delete.body":
      'Are you sure you want to delete "{name}"? This action cannot be undone.',
    "viewer.delete.confirm": "Delete",
    "viewer.delete.cancel": "Cancel",
    "viewer.delete.success.title": "Deleted",
    "viewer.delete.success.body": "Image deleted successfully!",
    "viewer.delete.fail.title": "Error",
    "viewer.delete.fail.body": "Delete failed: {error}",
    "viewer.fullscreen.error": "Fullscreen error: {error}",

    // ---- 404.html static ----
    "404.title": "This image has left the gallery.",
    "404.subtitle":
      "Either it was deleted, the link is wrong, or it's just not feeling photogenic today. We checked behind the couch - still nothing.",
    "404.btn.gallery": "Back to My Gallery",
    "404.btn.login": "Go to Login",

    // ---- index.html static ----
    "index.heading": "Sign In",
    "index.label.email": "Email",
    "index.label.pass": "Password",
    "index.btn.submit": "Sign In",
    "index.switch": "Don't have an account?",
    "index.switch.link": "Create one",

    // ---- index.js dynamic ----
    "index.btn.submitting": "Signing In\u2026",
    "index.btn.submit": "Sign In",
    "index.error.email_req": "Email is required.",
    "index.error.email_fmt": "Enter a valid email address.",
    "index.error.pass_req": "Password is required.",
    "index.locked.default":
      "Too many failed login attempts. Please try again later.",
    // {minutes} = lockout duration from server response
    "index.locked.timed":
      "Too many failed login attempts. Try again in {minutes} minutes, or contact an administrator to unlock your account.",

    // ---- index.html modals ----
    "index.modal.wrong_creds.title": "Sign In Failed",
    "index.modal.wrong_creds.body":
      "Incorrect email or password. Please try again.",
    "index.modal.locked.title": "Account Temporarily Locked",
    "index.modal.locked.body":
      "Too many failed login attempts. Please try again later.",
    "index.modal.server_err.title": "Something Went Wrong",
    "index.modal.server_err.body":
      "The server returned an unexpected error. Please try again in a moment.",

    // ---- register.html static ----
    "register.heading": "Create Account",
    "register.label.email": "Email",
    "register.label.pass": "Password",
    "register.label.confirm": "Confirm Password",
    "register.btn.submit": "Create Account",
    "register.switch": "Already have an account?",
    "register.switch.link": "Sign in",

    // ---- register.js dynamic ----
    "register.btn.submitting": "Creating Account\u2026",
    "register.btn.submit": "Create Account",
    "register.error.email_req": "Email is required.",
    "register.error.email_fmt": "Enter a valid email address.",
    "register.error.pass_req": "Password is required.",
    "register.error.pass_min": "Password must be at least 8 characters.",
    "register.error.confirm_req": "Please confirm your password.",
    "register.error.confirm_mismatch": "Passwords do not match.",

    // ---- register.html modals ----
    "register.modal.email_taken.title": "Email Already in Use",
    "register.modal.email_taken.body":
      "An account with this email address already exists.",
    "register.modal.email_taken.link": "Sign in instead?",
    "register.modal.success.title": "Account Created!",
    "register.modal.success.body":
      "Your account has been created successfully. You will be redirected to the sign-in page now.",
    "register.modal.server_err.title": "Something Went Wrong",
    "register.modal.server_err.body":
      "The server returned an unexpected error. Please try again in a moment.",

    // ---- account.html static ----
    "account.subtitle": "Your personal image gallery.",
    "account.nav.info": "My Info",
    "account.nav.password": "Change Password",
    "account.danger.label": "Account Actions",
    "account.btn.logout": "Log Out",
    "account.btn.delete": "Delete Account",
    "account.info.title": "My Info",
    "account.info.email": "Email",
    "account.info.since": "Member Since",
    "account.pw.title": "Change Password",
    "account.pw.label.current": "Current Password",
    "account.pw.label.new": "New Password",
    "account.pw.label.confirm": "Confirm New Password",
    "account.pw.btn.submit": "Save New Password",

    // ---- account.js dynamic ----
    "account.btn.saving": "Saving\u2026",
    "account.btn.pw_submit": "Save New Password",
    "account.btn.deleting": "Deleting\u2026",
    "account.btn.delete_confirm": "Yes, Delete My Account",
    "account.info.load_err": "Could not load",
    "account.pw.error.current_req": "Current password is required.",
    "account.pw.error.new_req": "New password is required.",
    "account.pw.error.new_min": "Password must be at least 8 characters.",
    "account.pw.error.confirm_req": "Please confirm your new password.",
    "account.pw.error.confirm_mismatch": "Passwords do not match.",

    // ---- account.html modals ----
    "account.modal.logout.title": "Log Out?",
    "account.modal.logout.body":
      "You will be signed out and returned to the login page.",
    "account.modal.logout.cancel": "Cancel",
    "account.modal.logout.confirm": "Log Out",
    "account.modal.delete.title": "Delete Account?",
    "account.modal.delete.body":
      "This will permanently delete your account and all your uploaded images. This action cannot be undone.",
    "account.modal.delete.cancel": "Cancel",
    "account.modal.delete.confirm": "Yes, Delete My Account",
    "account.modal.pw_success.title": "Password Updated",
    "account.modal.pw_success.body":
      "Your password has been changed successfully.",
    "account.modal.wrong_pw.title": "Incorrect Password",
    "account.modal.wrong_pw.body":
      "The current password you entered is incorrect. Please try again.",
    "account.modal.server_err.title": "Something Went Wrong",
    "account.modal.server_err.body":
      "The server returned an unexpected error. Please try again in a moment.",

    // ---- admin.html static ----
    "admin.subtitle": "Admin Panel",
    "admin.nav.stats": "Statistics",
    "admin.nav.users": "Users",
    "admin.nav.label": "Navigation",
    "admin.btn.back": "Back to Gallery",
    "admin.stats.title": "Statistics",
    "admin.stats.total_users": "Total Users",
    "admin.stats.total_images": "Total Images",
    "admin.stats.storage": "Storage Used",
    "admin.stats.admins": "Admins",
    "admin.stats.blocked": "Blocked Users",
    "admin.users.title": "Users",
    "admin.users.add": "Add User",
    "admin.users.col.email": "Email",
    "admin.users.col.role": "Role",
    "admin.users.col.status": "Status",
    "admin.users.col.images": "Images",
    "admin.users.col.last_login": "Last Login",
    "admin.users.col.registered": "Registered",
    "admin.users.col.actions": "Actions",
    "admin.detail.title": "User Details",
    "admin.detail.email": "Email",
    "admin.detail.role": "Role",
    "admin.detail.status": "Status",
    "admin.detail.registered": "Registered",
    "admin.detail.last_login": "Last Login",
    "admin.detail.ip": "Registered IP",
    "admin.detail.images": "Total Images",
    "admin.detail.images_title": "Images",
    "admin.detail.btn.clear_lockout": "Clear Lockout",
    "admin.detail.btn.delete_user": "Delete User",
    "admin.add_user.title": "Add User",
    "admin.add_user.email": "Email",
    "admin.add_user.password": "Password",
    "admin.add_user.is_admin": "Grant admin privileges",
    "admin.add_user.cancel": "Cancel",
    "admin.add_user.submit": "Create User",
    "admin.confirm.title": "Confirm Action",
    "admin.confirm.body": "Are you sure?",
    "admin.confirm.cancel": "Cancel",
    "admin.confirm.confirm": "Confirm",
    "admin.info.title": "Notice",

    // ---- admin.js dynamic ----
    "admin.js.never": "Never",
    "admin.js.badge.admin": "Admin",
    "admin.js.badge.user": "User",
    "admin.js.badge.active": "Active",
    "admin.js.badge.blocked": "Blocked",
    "admin.js.badge.locked": "Locked Out",
    "admin.js.btn.grant_admin": "Grant Admin",
    "admin.js.btn.revoke_admin": "Revoke Admin",
    "admin.js.btn.block": "Block User",
    "admin.js.btn.unblock": "Unblock User",
    "admin.js.add_user.submitting": "Creating...",
    "admin.js.add_user.submit": "Create User",
    "admin.js.no_users": "No users found.",
    "admin.js.no_images": "No images.",
    "admin.js.confirm.revoke_admin": 'Revoke admin privileges from "{email}"?',
    "admin.js.confirm.revoke_admin.title": "Revoke Admin",
    "admin.js.confirm.block": 'Block "{email}"? They will be unable to log in.',
    "admin.js.confirm.block.title": "Block User",
    "admin.js.confirm.unblock": 'Unblock "{email}"?',
    "admin.js.confirm.unblock.title": "Unblock User",
    "admin.js.confirm.delete_user":
      'Permanently delete "{email}" and all {count} of their images? This cannot be undone.',
    "admin.js.confirm.delete_user.title": "Delete User",
    "admin.js.notice.title": "Notice",
    "admin.js.error.title": "Error",
    "admin.js.error.admin_status": "Failed to update admin status.",
    "admin.js.error.block_status": "Failed to update block status.",
    "admin.js.error.clear_lockout": "Failed to clear lockout.",
    "admin.js.error.delete_user": "Failed to delete user.",
    "admin.js.error.delete_image": "Failed to delete image.",
    "admin.js.error.create_user": "Failed to create user.",
    "admin.js.error.email_taken": "This email is already in use.",
    "admin.js.error.email_req": "Email is required.",
    "admin.js.error.pass_min": "Password must be at least 8 characters.",
    "admin.js.error.network": "Network error.",
    "admin.js.user_created": 'User "{email}" created successfully.',
    "admin.js.user_created.title": "User Created",
    "admin.js.lockout_cleared.title": "Lockout Cleared",

    // ---- Server-generated messages (pattern-matched by translateServerMessage in admin.js) ----
    "admin.js.server.cannot_block_self":
      "Administrators cannot block their own account.",
    "admin.js.server.cannot_revoke_self":
      "Administrators cannot revoke their own admin privileges.",
    "admin.js.server.cannot_delete_self":
      "Administrators cannot delete their own account via the admin panel. Use the account settings page instead.",
    // {count} = number of attempt records, {email} = user email
    "admin.js.server.lockout_cleared":
      "Lockout cleared. {count} attempt record(s) resolved for '{email}'.",
    // {email} = deleted user email, {count} = number of images removed
    "admin.js.server.user_deleted":
      "User '{email}' and {count} image(s) have been permanently deleted.",
    // {filename} = unique image name
    "admin.js.server.image_deleted":
      "Image '{filename}' has been permanently deleted.",
  },

  uk: {
    "modal.btn.ok": "OK",
    "modal.btn.cancel": "Скасувати",

    "header.subtitle":
      "Завантажуйте селфі, меми чи будь-які цікаві фотографії.",
    "header.aria.theme.to_dark": "Перемкнутися на темну тему",
    "header.aria.theme.to_light": "Перемкнутися на світлу тему",
    "header.aria.admin": "Панель адміністратора",
    "header.aria.account": "Мій обліковий запис",

    "upload.tab.upload": "Завантажити",
    "upload.tab.images": "Зображення",
    "upload.pad.main": "Виберіть файл або перетягніть його сюди",
    "upload.pad.sub":
      "Лише формати .jpg, .jpeg, .png, та gif.\nМаксимальний розмір файлу – 5MB",
    "upload.browse": "Огляд файлів",
    "upload.url.title": "Виберіть файл",
    "upload.url.copy": "Копіювати",

    "upload.status.uploading": "Завантаження...",
    "upload.status.success": "Файл завантажено: ",
    "upload.error.type":
      "Помилка завантаження. Дозволені лише файли JPG, PNG та GIF.",
    "upload.error.size_client":
      "Розмір файлу: {size} МБ. Максимальний розмір - 5 МБ.",
    "upload.error.size_server":
      "Помилка завантаження: файл завеликий. Максимальний розмір – 5 МБ.",
    "upload.error.invalid": "Помилка завантаження: некоректний файл",
    "upload.error.rate_limit":
      "Помилка завантаження: Забагато завантажень. Зачекайте хвилинку та спробуйте ще раз.",
    "upload.error.server": "Помилка завантаження: Помилка сервера ({status})",
    "upload.copy.copied": "Скопійовано!",
    "upload.copy.default": "КОПІЙУВАТИ",
    "upload.gallery.copy": "КОПІЙУВАТИ",
    "upload.gallery.copied": "СКОПІЙОВАНО",
    "upload.gallery.empty": "Немає зображень.",
    "upload.gallery.fail_copy": "Не вдалося скопіювати URL-адресу: {error}",
    "upload.gallery.fail_delete": "Не вдалося видалити: {error}",
    "upload.page_info": "Сторінка {current} з {total}",

    "controls.per_page": "На сторінку:",
    "controls.sort_by": "Сортувати:",
    "controls.order": "Порядок:",
    "controls.sort.time": "Час завантаження",
    "controls.sort.name": "Назва",
    "controls.sort.size": "Розмір",
    "controls.order.asc": "Зростання",
    "controls.order.desc": "Спадання",
    "controls.prev": "Попередня",
    "controls.next": "Наступна",

    "dialog.delete.title": "Видалити зображення",
    "dialog.delete.body":
      "Ви впевнені, що хочете видалити це зображення? Цю дію не можна буде скасувати.",
    "dialog.delete.confirm": "Видалити",
    "dialog.delete.cancel": "Скасувати",
    "dialog.delete_err.title": "Помилка",

    "viewer.page_title": "Деталі зображення",
    "viewer.label.filename": "Повна назва:",
    "viewer.label.original_name": "Оригінальна назва:",
    "viewer.label.unique_name": "Унікальна назва:",
    "viewer.label.size": "Розмір файлу:",
    "viewer.label.type": "Тип файлу:",
    "viewer.label.date": "Дата завантаження:",
    "viewer.btn.copy_url": "Копіювати URL",
    "viewer.btn.download": "Скачати",
    "viewer.btn.delete": "Видалити",

    "viewer.copy.copied": "СКОПІЙОВАНО",
    "viewer.copy.default": "КОПІЙУВАТИ URL",
    "viewer.copy.fail": "Не вдалося скопіювати: {error}",
    "viewer.delete.title": "Видалити зображення",
    "viewer.delete.body":
      'Ви впевнені, що хочете видалити "{name}"? Цю дію неможливо буде скасувати.',
    "viewer.delete.confirm": "Видалити",
    "viewer.delete.cancel": "Скасувати",
    "viewer.delete.success.title": "Видалено",
    "viewer.delete.success.body": "Зображення успішно видалено!",
    "viewer.delete.fail.title": "Помилка",
    "viewer.delete.fail.body": "Не вдалося видалити: {error}",
    "viewer.fullscreen.error": "Помилка повноекранного режиму: {error}",

    "404.title": "Це зображення покинуло галерею.",
    "404.subtitle":
      "Або це видалили, або посилання невірне, або воно сьогодні просто соромиться камер. Ми навіть за диван зазирнули - все одно пусто",
    "404.btn.gallery": "Повернутися до Галереї",
    "404.btn.login": "Перейти до Логіну",

    "index.heading": "Увійти",
    "index.label.email": "Електронна адреса",
    "index.label.pass": "Пароль",
    "index.btn.submit": "Увійти",
    "index.switch": "Не маєте облікового запису?",
    "index.switch.link": "Створіть його",
    "index.btn.submitting": "Вхід\u2026",
    "index.error.email_req": "Потрібна електронна адреса.",
    "index.error.email_fmt": "Введіть коректну електронну адресу.",
    "index.error.pass_req": "Потрібний пароль.",
    "index.locked.default":
      "Забагато невдалих спроб увійти. Будь ласка, спробуйте пізніше.",
    "index.locked.timed":
      "Забагато невдалих спроб входу. Спробуйте ще раз через {minutes} хвилин або зверніться до адміністратора, щоб розблокувати ваш обліковий запис.",
    "index.modal.wrong_creds.title": "Не вдалося увійти",
    "index.modal.wrong_creds.body":
      "Неправильна електронна адреса або пароль. Будь ласка, спробуйте ще раз.",
    "index.modal.locked.title": "Обліковий запис тимчасово заблоковано",
    "index.modal.locked.body":
      "Забагато невдалих спроб увійти. Будь ласка, спробуйте пізніше.",
    "index.modal.server_err.title": "Щось пішло не так",
    "index.modal.server_err.body":
      "Сервер повернув неочікувану помилку. Будь ласка, спробуйте ще раз за мить.",

    "register.heading": "Створити обліковий запис",
    "register.label.email": "Електронна адреса",
    "register.label.pass": "Пароль",
    "register.label.confirm": "Підтвердити пароль",
    "register.btn.submit": "Створити обліковий запис",
    "register.switch": "Вже маєте обліковий запис?",
    "register.switch.link": "Увійти",
    "register.btn.submitting": "Створення облікового запису\u2026",
    "register.btn.submit": "Створити обліковий запис",
    "register.error.email_req": "Потрібна електронна адреса.",
    "register.error.email_fmt": "Введіть коректну електронну адресу.",
    "register.error.pass_req": "Потрібний пароль.",
    "register.error.pass_min": "Пароль повинен містити не менше 8 символів.",
    "register.error.confirm_req": "Потрібно підтвердити пароль.",
    "register.error.confirm_mismatch": "Паролі не співпадають.",
    "register.modal.email_taken.title":
      "Електронна адреса вже використовується",
    "register.modal.email_taken.body":
      "Обліковий запис з такою електронною адресою вже існує.",
    "register.modal.email_taken.link": "Увійти?",
    "register.modal.success.title": "Обліковий запис створено!",
    "register.modal.success.body":
      "Обліковий запис створено успішно. Ви будите перенаправлені на сторінку входу.",
    "register.modal.server_err.title": "Щось пішло не так",
    "register.modal.server_err.body":
      "Сервер повернув неочікувану помилку. Будь ласка, спробуйте ще раз за мить.",

    "account.subtitle": "Ваша особиста галерея зображень.",
    "account.nav.info": "Моя інформація",
    "account.nav.password": "Змінити пароль",
    "account.danger.label": "Дії з обліковим записом",
    "account.btn.logout": "Вийти",
    "account.btn.delete": "Видалити обліковий запис",
    "account.info.title": "Моя інформація",
    "account.info.email": "Електронна адреса",
    "account.info.since": "Зареєстрований з",
    "account.pw.title": "Змінити пароль",
    "account.pw.label.current": "Поточний пароль",
    "account.pw.label.new": "Новий пароль",
    "account.pw.label.confirm": "Підтвердити новий пароль",
    "account.pw.btn.submit": "Змінити пароль",
    "account.btn.saving": "Збереження\u2026",
    "account.btn.pw_submit": "Змінити пароль",
    "account.btn.deleting": "Видалення\u2026",
    "account.btn.delete_confirm": "Підтвердити видалення",
    "account.info.load_err": "Не вдалося завантажити",
    "account.pw.error.current_req": "Потрібен поточний пароль.",
    "account.pw.error.new_req": "Потрібен новий пароль.",
    "account.pw.error.new_min": "Пароль повинен містити не менше 8 символів.",
    "account.pw.error.confirm_req": "Будь ласка, підтвердьте новий пароль.",
    "account.pw.error.confirm_mismatch": "Паролі не збігаються.",
    "account.modal.logout.title": "Вийти?",
    "account.modal.logout.body":
      "Ви вийдете з системи та повернетеся на сторінку входу.",
    "account.modal.logout.cancel": "Скасувати",
    "account.modal.logout.confirm": "Вийти",
    "account.modal.delete.title": "Видалити обліковий запис?",
    "account.modal.delete.body":
      "Ваш обліковий запис і всі завантажені зображення буде назавжди видалено. Цю дію не можна буде скасувати.",
    "account.modal.delete.cancel": "Скасувати",
    "account.modal.delete.confirm": "Підтвердити видалення",
    "account.modal.pw_success.title": "Пароль оновлено",
    "account.modal.pw_success.body": "Ваш пароль успішно змінено.",
    "account.modal.wrong_pw.title": "Неправильний пароль",
    "account.modal.wrong_pw.body":
      "Поточний пароль, який ви ввели, неправильний. Спробуйте ще раз.",
    "account.modal.server_err.title": "Щось пішло не так",
    "account.modal.server_err.body":
      "Сервер повернув неочікувану помилку. Будь ласка, спробуйте ще раз за мить.",

    "admin.subtitle": "Панель адміністратора",
    "admin.nav.stats": "Статистика",
    "admin.nav.users": "Користувачі",
    "admin.nav.label": "Навігація",
    "admin.btn.back": "Назад до галереі",
    "admin.stats.title": "Статистика",
    "admin.stats.total_users": "Всього користувачів",
    "admin.stats.total_images": "Всього зображень",
    "admin.stats.storage": "Використана пам'ять",
    "admin.stats.admins": "Адміністратори",
    "admin.stats.blocked": "Заблоковані користувачі",
    "admin.users.title": "Користувачі",
    "admin.users.add": "Додати користувача",
    "admin.users.col.email": "Електронна адреса",
    "admin.users.col.role": "Роль",
    "admin.users.col.status": "Статус",
    "admin.users.col.images": "Зображення",
    "admin.users.col.last_login": "Останній вхід",
    "admin.users.col.registered": "Зареєстрований з",
    "admin.users.col.actions": "Дії",
    "admin.detail.title": "Деталі користувача",
    "admin.detail.email": "Електронна адреса",
    "admin.detail.role": "Роль",
    "admin.detail.status": "Статус",
    "admin.detail.registered": "Зареєстрований з",
    "admin.detail.last_login": "Останній вхід",
    "admin.detail.ip": "IP-адреса реєстрації",
    "admin.detail.images": "Всього зображень",
    "admin.detail.images_title": "Зображення",
    "admin.detail.btn.clear_lockout": "Зняти обмеження",
    "admin.detail.btn.delete_user": "Видалити користувача",
    "admin.add_user.title": "Додати користувача",
    "admin.add_user.email": "Електронна адреса",
    "admin.add_user.password": "Пароль",
    "admin.add_user.is_admin": "Надати права адміністратора",
    "admin.add_user.cancel": "Скасувати",
    "admin.add_user.submit": "Створити користувача",
    "admin.confirm.title": "Підтвердити дію",
    "admin.confirm.body": "Ви впевнені?",
    "admin.confirm.cancel": "Скасувати",
    "admin.confirm.confirm": "Підтвердити",
    "admin.info.title": "Повідомлення",
    "admin.js.never": "Ніколи",
    "admin.js.badge.admin": "Адміністратор",
    "admin.js.badge.user": "Користувач",
    "admin.js.badge.active": "Активний",
    "admin.js.badge.blocked": "Заблокований",
    "admin.js.badge.locked": "Обмежено",
    "admin.js.btn.grant_admin": "Надати права адміністратора",
    "admin.js.btn.revoke_admin": "Скасувати права адміністратора",
    "admin.js.btn.block": "Заблокувати користувача",
    "admin.js.btn.unblock": "Розблокувати користувача",
    "admin.js.add_user.submitting": "Створення...",
    "admin.js.add_user.submit": "Створити користувача",
    "admin.js.no_users": "Користувачів не знайдено.",
    "admin.js.no_images": "Зображень не знайдено.",
    "admin.js.confirm.revoke_admin":
      'Скасувати права адміністратора для "{email}"?',
    "admin.js.confirm.revoke_admin.title": "Скасувати права адміністратора",
    "admin.js.confirm.block":
      'Заблокувати "{email}"? Користувач не зможе увійти в систему.',
    "admin.js.confirm.block.title": "Заблокувати користувача",
    "admin.js.confirm.unblock": 'Розблокувати "{email}"?',
    "admin.js.confirm.unblock.title": "Розблокувати користувача",
    "admin.js.confirm.delete_user":
      'Видалити "{email}" та всі {count} зображень(-я) до нього назавжди? Цю дію неможливо буде скасувати.',
    "admin.js.confirm.delete_user.title": "Видалити користувача",
    "admin.js.notice.title": "Повідомлення",
    "admin.js.error.title": "Помилка",
    "admin.js.error.admin_status": "Не вдалося оновити статус адміністратора.",
    "admin.js.error.block_status": "Не вдалося оновити статус блокування.",
    "admin.js.error.clear_lockout": "Не вдалося зняти обмеження.",
    "admin.js.error.delete_user": "Не вдалося видалити користувача.",
    "admin.js.error.delete_image": "Не вдалося видалити зображення.",
    "admin.js.error.create_user": "Не вдалося створити користувача.",
    "admin.js.error.email_taken": "Ця електронна адреса вже використовується.",
    "admin.js.error.email_req": "Потрібна електронна адреса.",
    "admin.js.error.pass_min": "Пароль повинен містити не менше 8 символів.",
    "admin.js.error.network": "Помилка мережі.",
    "admin.js.user_created": 'Користувача "{email}" створено.',
    "admin.js.user_created.title": "Користувача створено",
    "admin.js.lockout_cleared.title": "Обмеження знято",

    "admin.js.server.cannot_block_self":
      "Адміністратори не можуть блокувати власні облікові записи.",
    "admin.js.server.cannot_revoke_self":
      "Адміністратори не можуть скасовувати права адміністратора власному обліковому запису.",
    "admin.js.server.cannot_delete_self":
      "Адміністратори не можуть видалити свій обліковий запис через панель адміністратора. Натомість скористайтеся сторінкою налаштувань облікового запису.",
    "admin.js.server.lockout_cleared":
      "Обмеження знято. {count} запис(ів) обмежень розв’язано для '{email}'.",
    "admin.js.server.user_deleted":
      "Користувача '{email}' та {count} зображень було видалено назавжди.",
    "admin.js.server.image_deleted":
      "TRANSLATE_ME: Image '{filename}' has been permanently deleted.",
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Currently active language code. */
let currentLang = localStorage.getItem("lang") || "en";

/**
 * Translate a key in the current language with optional token substitution.
 * Falls back to English if the key is missing from the active locale, and returns the key itself as a last resort so nothing silently disappears.
 *
 * @param {string} key
 * @param {Record<string, string>} [vars] - Token substitution map, e.g. { name: "foo" } replaces {name}.
 * @returns {string}
 */
function t(key, vars = {}) {
  const str = STRINGS[currentLang]?.[key] ?? STRINGS["en"]?.[key] ?? key;

  return str.replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? `{${name}}`);
}

/**
 * Walk all [data-i18n] elements and update their textContent (or innerHTML for strings containing \n, which are rendered as <br>).
 * Also syncs theme toggle aria-labels and the lang toggle button label.
 * Dispatches "langchange" on window for JS modules to re-render dynamic UI.
 */
function applyLang() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    const translated = t(key);
    if (translated.includes("\n")) {
      el.innerHTML = translated.replace(/\n/g, "<br>");
    } else {
      el.textContent = translated;
    }
  });

  // Sync theme toggle aria-labels to the active language.
  document.querySelectorAll("#theme-toggle").forEach((btn) => {
    const dark =
      document.documentElement.getAttribute("data-theme") === "dark" ||
      (!localStorage.getItem("theme") &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    const label = dark
      ? t("header.aria.theme.to_light")
      : t("header.aria.theme.to_dark");
    btn.setAttribute("aria-label", label);
    btn.setAttribute("title", label);
  });

  document.querySelectorAll("#lang-toggle").forEach(syncLangBtn);

  window.dispatchEvent(new Event("langchange"));
}

/**
 * Set the lang toggle button label to the inactive language code.
 * @param {HTMLElement} btn
 */
function syncLangBtn(btn) {
  if (!btn) return;
  const other = currentLang === "en" ? "UA" : "EN";
  btn.textContent = other;
  btn.setAttribute(
    "aria-label",
    currentLang === "en" ? "Switch to Ukrainian" : "Switch to English",
  );
  btn.setAttribute(
    "title",
    currentLang === "en" ? "Switch to Ukrainian" : "Switch to English",
  );
}

/**
 * Switch to the other language, persist the choice, and re-render.
 */
function toggleLang() {
  currentLang = currentLang === "en" ? "uk" : "en";
  localStorage.setItem("lang", currentLang);
  applyLang();
}

function init() {
  const btn = document.getElementById("lang-toggle");
  if (btn) btn.addEventListener("click", toggleLang);
  applyLang();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// Expose helpers as globals - these pages don't use ES modules, so window.t() is the shared interface for all JS files.
window.t = t;
/** Always returns the current language code (call as a function to avoid stale closures). */
window.currentLang = () => currentLang;