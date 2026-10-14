// Mencegah jendela konsol tambahan di Windows pada build rilis.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    meow_corner_lib::run()
}
