const boardEl = document.getElementById("board");

// Provisional (hito 1): crear 16 celdas vacías solo para ver la rejilla.
for (let i = 0; i < 16; i++) {
  const cell = document.createElement("div");
  cell.className = "cell";
  boardEl.appendChild(cell);
}