use local_ip_address::local_ip;
use serde::Serialize;
use std::{fs, path::PathBuf};
use sysinfo::{Disks, System};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MachineInfo {
    pub machine_id: String,
    pub hostname: String,
    pub os_name: String,
    pub os_version: String,
    pub kernel_version: String,
    pub arch: String,
    pub cpu_logical_cores: usize,
    pub cpu_physical_cores: usize,
    pub cpu_brand: String,
    pub total_memory_mb: u64,
    pub used_memory_mb: u64,
    pub total_disk_mb: u64,
    pub available_disk_mb: u64,
    pub local_ip: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetricsTick {
    pub cpu_percent: f32,
    pub used_memory_mb: u64,
    pub total_memory_mb: u64,
}

fn fallback_machine_id() -> String {
    let path: PathBuf = dirs::home_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join(".HyperCore")
        .join("machine_id");

    if let Ok(value) = fs::read_to_string(&path) {
        let value = value.trim().to_owned();
        if !value.is_empty() {
            return value;
        }
    }
    let value = Uuid::new_v4().to_string();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let _ = fs::write(path, &value);
    value
}

impl MachineInfo {
    pub fn collect() -> Self {
        let mut system = System::new_all();
        system.refresh_all();
        let disks = Disks::new_with_refreshed_list();
        let total_disk = disks
            .list()
            .iter()
            .map(|disk| disk.total_space())
            .sum::<u64>();
        let available_disk = disks
            .list()
            .iter()
            .map(|disk| disk.available_space())
            .sum::<u64>();
        let cpu_brand = system
            .cpus()
            .first()
            .map(|cpu| cpu.brand().to_owned())
            .unwrap_or_else(|| "Unknown CPU".to_owned());
        Self {
            machine_id: machine_uid::get().unwrap_or_else(|_| fallback_machine_id()),
            hostname: System::host_name().unwrap_or_else(|| "Unknown".to_owned()),
            os_name: System::name().unwrap_or_else(|| "Unknown".to_owned()),
            os_version: System::os_version().unwrap_or_else(|| "Unknown".to_owned()),
            kernel_version: System::kernel_version().unwrap_or_else(|| "Unknown".to_owned()),
            arch: std::env::consts::ARCH.to_owned(),
            cpu_logical_cores: system.cpus().len(),
            cpu_physical_cores: system.physical_core_count().unwrap_or(0),
            cpu_brand,
            total_memory_mb: system.total_memory() / 1024 / 1024,
            used_memory_mb: system.used_memory() / 1024 / 1024,
            total_disk_mb: total_disk / 1024 / 1024,
            available_disk_mb: available_disk / 1024 / 1024,
            local_ip: local_ip()
                .map(|ip| ip.to_string())
                .unwrap_or_else(|_| "Unavailable".to_owned()),
        }
    }
}

pub fn collect_metrics() -> MetricsTick {
    let mut system = System::new_all();
    system.refresh_cpu_usage();
    std::thread::sleep(std::time::Duration::from_millis(150));
    system.refresh_cpu_usage();
    let cpu_percent = if system.cpus().is_empty() {
        0.0
    } else {
        system.cpus().iter().map(|cpu| cpu.cpu_usage()).sum::<f32>() / system.cpus().len() as f32
    };
    MetricsTick {
        cpu_percent,
        used_memory_mb: system.used_memory() / 1024 / 1024,
        total_memory_mb: system.total_memory() / 1024 / 1024,
    }
}
