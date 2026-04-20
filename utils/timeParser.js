export function parseEncodeFlag(encode) {

  if (!/^\d{6}(AM|PM)$/.test(encode)) {
    throw new Error("Invalid time format. Use YYMMDDAM or YYMMDDPM");
  }

  const year = 2000 + parseInt(encode.slice(0, 2));
  const month = parseInt(encode.slice(2, 4)) - 1;
  const day = parseInt(encode.slice(4, 6));
  const session = encode.slice(6);

  const D = new Date(year, month, day);

  const dayOfWeek = D.getDay(); // 0 Sunday, 1 Monday

  const offset = (dayOfWeek === 1) ? 2 : 1;

  const Dminus = new Date(D);
  Dminus.setDate(D.getDate() - offset);

  const pad = n => n.toString().padStart(2, "0");

  const format = (date, hour) =>
    `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(hour)}:00`;

  const timeFrom = format(Dminus, 14);
  const timeTo = session === "AM"
    ? format(D, 8)
    : format(D, 14);

  return { timeFrom, timeTo };

}
