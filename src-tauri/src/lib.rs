//! Sisi native Meow Corner: jendela strip transparan di atas taskbar, klik tembus,
//! ikon tray, penyembunyian otomatis saat ada aplikasi layar penuh, file simpanan,
//! jadwal pengingat dengan notifikasi Windows, dan penyimpanan foto.

use std::collections::HashMap;
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri_plugin_notification::NotificationExt;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, State, WebviewWindow, WindowEvent};

/// Tinggi bawaan jendela strip, piksel logis. Ruang di atas strip dipakai panel.
const DEFAULT_HEIGHT: f64 = 440.0;
const MAIN: &str = "main";

#[derive(Default)]
struct Visibility {
    /// Disembunyikan pengguna lewat tray atau tombol "Sembunyikan".
    user_hidden: AtomicBool,
    /// Disembunyikan otomatis karena ada aplikasi layar penuh.
    auto_hidden: AtomicBool,
    /// Pengguna menampilkan strip saat aplikasi layar penuh aktif: jangan disembunyikan
    /// otomatis sampai keadaan layar penuh berakhir.
    forced_visible: AtomicBool,
}

type SharedVisibility = Arc<Visibility>;

#[derive(Serialize)]
struct CursorInfo {
    /// Posisi kursor relatif terhadap jendela, piksel logis (sama dengan koordinat CSS).
    x: f64,
    y: f64,
    inside: bool,
}

// ---------------------------------------------------------------------------
// Jendela

fn main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(MAIN)
}

/// Tempelkan jendela selebar layar tepat di atas taskbar (area kerja monitor).
fn dock(window: &WebviewWindow, height: f64) -> tauri::Result<()> {
    let monitor = match window.current_monitor()? {
        Some(m) => m,
        None => match window.primary_monitor()? {
            Some(m) => m,
            None => return Ok(()),
        },
    };
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let h = ((height * scale).round() as u32).min(area.size.height);
    window.set_size(PhysicalSize::new(area.size.width, h))?;
    window.set_position(PhysicalPosition::new(
        area.position.x,
        area.position.y + area.size.height as i32 - h as i32,
    ))?;
    Ok(())
}

#[tauri::command]
fn dock_window(window: WebviewWindow, height: f64) -> Result<(), String> {
    dock(&window, height).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_click_through(window: WebviewWindow, ignore: bool) -> Result<(), String> {
    // Di Linux jendela yang belum tampil belum punya permukaan; abaikan dengan aman.
    if !window.is_visible().unwrap_or(false) {
        return Ok(());
    }
    window.set_ignore_cursor_events(ignore).map_err(|e| e.to_string())
}

/// Tampilkan jendela lalu pasang lagi klik tembus. Urutannya penting:
/// di Linux, klik tembus hanya bisa dipasang setelah jendela tampil.
fn show_window(window: &WebviewWindow) -> tauri::Result<()> {
    window.show()?;
    window.set_ignore_cursor_events(true)
}

#[tauri::command]
fn cursor_in_window(window: WebviewWindow) -> Result<CursorInfo, String> {
    let cursor = window.cursor_position().map_err(|e| e.to_string())?;
    let pos = window.inner_position().map_err(|e| e.to_string())?;
    let size = window.inner_size().map_err(|e| e.to_string())?;
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let rx = cursor.x - pos.x as f64;
    let ry = cursor.y - pos.y as f64;
    let inside = rx >= 0.0 && ry >= 0.0 && rx < size.width as f64 && ry < size.height as f64;
    Ok(CursorInfo {
        x: rx / scale,
        y: ry / scale,
        inside,
    })
}

fn set_user_hidden(app: &AppHandle, vis: &Visibility, hidden: bool) {
    vis.user_hidden.store(hidden, Ordering::SeqCst);
    if !hidden {
        vis.auto_hidden.store(false, Ordering::SeqCst);
        vis.forced_visible
            .store(platform::fullscreen_app_active(), Ordering::SeqCst);
    }
    if let Some(w) = main_window(app) {
        if hidden {
            let _ = w.hide();
        } else {
            let _ = dock(&w, DEFAULT_HEIGHT);
            let _ = show_window(&w);
        }
    }
    let _ = app.emit("visibility-changed", !hidden);
}

fn toggle_visibility(app: &AppHandle) {
    let vis = app.state::<SharedVisibility>();
    let visible = main_window(app)
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false);
    set_user_hidden(app, &vis, visible);
}

#[tauri::command]
fn window_visible(window: WebviewWindow) -> bool {
    window.is_visible().unwrap_or(true)
}

#[tauri::command]
fn hide_window(app: AppHandle, vis: State<'_, SharedVisibility>) {
    set_user_hidden(&app, &vis, true);
}

/// Munculkan lagi strip yang disembunyikan pengguna (misalnya saat pengingat berbunyi).
/// Strip yang disembunyikan otomatis karena aplikasi layar penuh dibiarkan.
#[tauri::command]
fn show_strip(app: AppHandle, vis: State<'_, SharedVisibility>) {
    if vis.user_hidden.load(Ordering::SeqCst) {
        set_user_hidden(&app, &vis, false);
    }
}

/// Keluar dengan rapi; bila ada layanan sistem yang menahan proses (misalnya tray
/// tanpa DBus di Linux), proses dihentikan paksa setelah jeda singkat.
fn exit_app(app: &AppHandle) {
    app.exit(0);
    std::thread::spawn(|| {
        std::thread::sleep(Duration::from_millis(1500));
        std::process::exit(0);
    });
}

/// Minta frontend menyimpan dulu; bila tidak menjawab dalam 2 detik, keluar tetap jalan.
fn request_quit(app: &AppHandle) {
    let _ = app.emit("request-quit", ());
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(2));
        exit_app(&handle);
    });
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    exit_app(&app);
}

// ---------------------------------------------------------------------------
// File simpanan: save.json + cadangan save.json.bak di folder data aplikasi.

fn save_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("save.json"))
}

fn read_if_exists(path: &PathBuf) -> Result<Option<String>, String> {
    match std::fs::read_to_string(path) {
        Ok(text) => Ok(Some(text)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn load_save(app: AppHandle) -> Result<Option<String>, String> {
    read_if_exists(&save_path(&app)?)
}

#[tauri::command]
fn load_backup(app: AppHandle) -> Result<Option<String>, String> {
    read_if_exists(&save_path(&app)?.with_extension("json.bak"))
}

#[tauri::command]
fn write_save(app: AppHandle, data: String) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&data).map_err(|e| format!("data simpanan tidak valid: {e}"))?;
    let path = save_path(&app)?;
    let tmp = path.with_extension("json.tmp");
    {
        let mut file = std::fs::File::create(&tmp).map_err(|e| e.to_string())?;
        file.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        // Pastikan isi benar-benar di disk sebelum menggantikan simpanan lama.
        file.sync_all().map_err(|e| e.to_string())?;
    }
    // Simpanan lama yang valid menjadi cadangan. Bila proses berhenti di antara dua
    // rename, load_save kosong dan frontend memakai cadangan.
    if let Ok(Some(old)) = read_if_exists(&path) {
        if serde_json::from_str::<serde_json::Value>(&old).is_ok() {
            std::fs::rename(&path, path.with_extension("json.bak")).map_err(|e| e.to_string())?;
        }
    }
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Jadwal pengingat. Pengecekan waktu dilakukan di sini, bukan di halaman web,
// karena timer JavaScript diperlambat saat jendela tersembunyi.

#[derive(Deserialize, Clone)]
struct DueItem {
    key: String,
    /// Waktu berbunyi, ms sejak epoch.
    at: f64,
    title: String,
    body: String,
    notify: bool,
}

#[derive(Default)]
struct ScheduleInner {
    items: Vec<DueItem>,
    /// Kunci yang sudah berbunyi (dengan waktunya), agar jadwal yang dikirim ulang
    /// sebelum halaman sempat memprosesnya tidak berbunyi dua kali.
    fired: HashMap<String, f64>,
}

/// Satu kunci untuk jadwal dan daftar yang sudah berbunyi, agar tidak ada celah
/// di antara keduanya (jadwal baru yang masuk tepat saat sebuah kejadian berbunyi).
#[derive(Default)]
struct Schedule(Mutex<ScheduleInner>);

type SharedSchedule = Arc<Schedule>;

fn now_ms() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as f64)
        .unwrap_or(0.0)
}

#[tauri::command]
fn set_schedule(items: Vec<DueItem>, schedule: State<'_, SharedSchedule>) {
    let mut inner = schedule.0.lock().unwrap_or_else(|e| e.into_inner());
    let fresh: Vec<DueItem> = items.into_iter().filter(|i| !inner.fired.contains_key(&i.key)).collect();
    inner.items = fresh;
}

fn spawn_scheduler(app: AppHandle, schedule: SharedSchedule) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(1000));
        let now = now_ms();
        let due: Vec<DueItem> = {
            let mut inner = schedule.0.lock().unwrap_or_else(|e| e.into_inner());
            let items = std::mem::take(&mut inner.items);
            let (due, rest): (Vec<DueItem>, Vec<DueItem>) = items.into_iter().partition(|i| i.at <= now);
            inner.items = rest;
            if !due.is_empty() {
                // Lupakan kunci lama (lebih dari sehari) agar peta tidak terus membesar.
                inner.fired.retain(|_, at| now - *at < 86_400_000.0);
                for item in &due {
                    inner.fired.insert(item.key.clone(), now);
                }
            }
            due
        };
        if due.is_empty() {
            continue;
        }
        for item in due {
            if item.notify {
                let _ = app
                    .notification()
                    .builder()
                    .title(&item.title)
                    .body(&item.body)
                    .show();
            }
            let _ = app.emit("schedule-due", item.key);
        }
    });
}

// ---------------------------------------------------------------------------
// Foto: PNG disimpan di folder Gambar/Meow Corner.

fn photo_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .picture_dir()
        .or_else(|_| app.path().download_dir())
        .or_else(|_| app.path().app_data_dir())
        .map_err(|e| e.to_string())?;
    let dir = base.join("Meow Corner");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[tauri::command]
fn save_photo(app: AppHandle, name: String, data: Vec<u8>) -> Result<String, String> {
    // Hanya nama file sederhana; tidak boleh keluar dari folder foto.
    let safe: String = name
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .take(60)
        .collect();
    if safe.is_empty() || data.len() > 20_000_000 || !data.starts_with(&[0x89, b'P', b'N', b'G']) {
        return Err("foto tidak valid".into());
    }
    let path = photo_dir(&app)?.join(format!("{safe}.png"));
    std::fs::write(&path, data).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

/// Buka folder foto di penjelajah file.
#[tauri::command]
fn open_photo_folder(app: AppHandle) -> Result<(), String> {
    let dir = photo_dir(&app)?;
    #[cfg(windows)]
    let program = "explorer";
    #[cfg(target_os = "macos")]
    let program = "open";
    #[cfg(all(unix, not(target_os = "macos")))]
    let program = "xdg-open";
    std::process::Command::new(program)
        .arg(&dir)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Deteksi aplikasi layar penuh (game, presentasi, video)

#[cfg(windows)]
mod platform {
    use windows_sys::Win32::UI::Shell::{
        SHQueryUserNotificationState, QUERY_USER_NOTIFICATION_STATE, QUNS_BUSY, QUNS_PRESENTATION_MODE,
        QUNS_RUNNING_D3D_FULL_SCREEN,
    };

    pub fn fullscreen_app_active() -> bool {
        let mut state: QUERY_USER_NOTIFICATION_STATE = 0;
        let hr = unsafe { SHQueryUserNotificationState(&mut state) };
        hr >= 0 && matches!(state, QUNS_BUSY | QUNS_RUNNING_D3D_FULL_SCREEN | QUNS_PRESENTATION_MODE)
    }
}

#[cfg(not(windows))]
mod platform {
    /// Belum diimplementasikan di macOS/Linux; strip tetap tampil.
    pub fn fullscreen_app_active() -> bool {
        false
    }
}

fn spawn_fullscreen_watcher(app: AppHandle, vis: SharedVisibility) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(1500));
        let Some(window) = main_window(&app) else { continue };
        let user_hidden = vis.user_hidden.load(Ordering::SeqCst);
        if platform::fullscreen_app_active() {
            let forced = vis.forced_visible.load(Ordering::SeqCst);
            if !user_hidden && !forced && !vis.auto_hidden.swap(true, Ordering::SeqCst) {
                let _ = window.hide();
                let _ = app.emit("visibility-changed", false);
            }
            continue;
        }
        // Layar penuh sudah berakhir: pemaksaan tampil tidak lagi diperlukan.
        vis.forced_visible.store(false, Ordering::SeqCst);
        if vis.auto_hidden.swap(false, Ordering::SeqCst) && !user_hidden {
            let _ = show_window(&window);
            let _ = app.emit("visibility-changed", true);
        }
    });
}

// ---------------------------------------------------------------------------
// Tray

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let toggle = MenuItem::with_id(app, "toggle", "Tampilkan / sembunyikan", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Keluar", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&toggle, &quit])?;
    let mut builder = TrayIconBuilder::with_id("main-tray")
        .tooltip("Meow Corner")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "toggle" => toggle_visibility(app),
            "quit" => request_quit(app),
            _ => {}
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let visibility: SharedVisibility = Arc::new(Visibility::default());
    let schedule: SharedSchedule = Arc::new(Schedule::default());

    tauri::Builder::default()
        // Membuka game kedua kali cukup menampilkan jendela yang sudah ada.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let vis = app.state::<SharedVisibility>();
            set_user_hidden(app, &vis, false);
        }))
        .plugin(tauri_plugin_notification::init())
        .manage(visibility.clone())
        .manage(schedule.clone())
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                request_quit(window.app_handle());
            }
        })
        .invoke_handler(tauri::generate_handler![
            dock_window,
            set_click_through,
            cursor_in_window,
            hide_window,
            window_visible,
            quit_app,
            load_save,
            load_backup,
            write_save,
            show_strip,
            set_schedule,
            save_photo,
            open_photo_folder,
        ])
        .setup(move |app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            build_tray(app)?;
            if let Some(window) = app.get_webview_window(MAIN) {
                dock(&window, DEFAULT_HEIGHT)?;
                show_window(&window)?;
            }
            spawn_fullscreen_watcher(app.handle().clone(), visibility.clone());
            spawn_scheduler(app.handle().clone(), schedule.clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("gagal menjalankan Meow Corner");
}
