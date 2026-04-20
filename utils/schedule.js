export function getSchedules(now = new Date()) {
  const hour = now.getHours();

  const schedules = [];

  const shift = (h) => new Date(now.getTime() - h * 60 * 60 * 1000);

  const format = d => {
    const pad = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:00`;
  };

  // 08:00
  if (hour === 8) {
    schedules.push({
      label: "OPM_PC_24H",
      from: shift(24),
      to: now
    });

    schedules.push({
      label: "NIGHT_SHIFT_12H",
      from: shift(12),
      to: now
    });
  }

  // 14:00
  if (hour === 14) {
    schedules.push({
      label: "TPM_24H",
      from: shift(24),
      to: now
    });

    schedules.push({
      label: "DAY_ONGOING_6H",
      from: shift(6),
      to: now
    });
  }

  // 20:00
  if (hour === 20) {
    schedules.push({
      label: "DAY_SHIFT_12H",
      from: shift(12),
      to: now
    });
  }

  // 02:00
  if (hour === 2) {
    schedules.push({
      label: "NIGHT_ONGOING_8H",
      from: shift(8),
      to: now
    });
  }

  return schedules.map(s => ({
    ...s,
    timeFrom: format(s.from),
    timeTo: format(s.to)
  }));
}
