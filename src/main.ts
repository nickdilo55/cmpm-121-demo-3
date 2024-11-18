import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import "./leafletWorkaround.ts";
import luck from "./luck.ts";

const OAKES = leaflet.latLng(36.98949379578401, -122.06277128548504);

const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;
const MOVE_STEP = TILE_DEGREES / 2;

let playerDirection = 0;
let playerPoints = 0;
let playerCoins: string[] = [];

const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!;
statusPanel.innerHTML = "You have no coins yet.";

const map = leaflet.map(document.getElementById("map")!, {
  center: OAKES,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(map);

const playerIconHtml = `
  <div id="playerMarker" style="transform: rotate(0deg);">
    <img src="${
  new URL("./images/playerArrow.png", import.meta.url).toString()
}"
         style="width: 24px; height: 24px;" />
  </div>
`;

const playerIcon = leaflet.divIcon({
  className: "",
  html: playerIconHtml,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const playerMarker = leaflet.marker(OAKES, { icon: playerIcon });
playerMarker.bindTooltip("You are here!");
playerMarker.addTo(map);

class GameCell {
  constructor(
    public lat: number,
    public lng: number,
    public coins: string[] = [],
  ) {}
  addCoin(coinId: string) {
    this.coins.push(coinId);
  }
  removeCoin(coinId: string) {
    this.coins = this.coins.filter((coin) => coin !== coinId);
  }
}

class GameCellFactory {
  private cells: Map<string, GameCell> = new Map();
  getCell(lat: number, lng: number): GameCell {
    const key = `${lat}:${lng}`;
    if (!this.cells.has(key)) {
      this.cells.set(key, new GameCell(lat, lng));
    }
    return this.cells.get(key)!;
  }
  clear() {
    this.cells.clear();
  }
}
const gameCellFactory = new GameCellFactory();

function spawnCache(lat: number, lng: number) {
  const gameCell = gameCellFactory.getCell(lat, lng);

  const bounds = leaflet.latLngBounds([
    [lat, lng],
    [lat + TILE_DEGREES, lng + TILE_DEGREES],
  ]);
  const rects = leaflet.rectangle(bounds);
  rects.bindTooltip(
    `You found a cache at [${lat.toFixed(6)}, ${lng.toFixed(6)}]!`,
  );
  rects.addTo(map);

  const coinCount = Math.floor(luck([lat, lng, "coinCount"].toString()) * 5);
  for (let serial = 0; serial < coinCount; serial++) {
    const coinId = `${lat.toFixed(6)}:${lng.toFixed(6)}#${serial}`;
    gameCell.addCoin(coinId);
  }

  rects.bindPopup(() => {
    const popupDiv = document.createElement("div");
    popupDiv.innerHTML = `
      <div> This cache is at [${lat.toFixed(6)}, ${
      lng.toFixed(6)
    }] and contains ${gameCell.coins.length} coin(s). </div>
      <div> Coins in cache: </div>
      <ul id="coinList"></ul>
      <button id="poke" style="color: lightblue;">Collect All Coins</button>
      <button id="deposit" style="color: lightblue;">Deposit All Coins</button>`;

    const coinList = popupDiv.querySelector<HTMLUListElement>("#coinList")!;
    gameCell.coins.forEach((coin) => {
      const listItem = document.createElement("li");
      listItem.textContent = coin;
      coinList.appendChild(listItem);
    });

    // Collect all coins
    popupDiv.querySelector("#poke")!.addEventListener("click", () => {
      if (gameCell.coins.length > 0) {
        playerCoins = [...playerCoins, ...gameCell.coins];
        playerPoints += gameCell.coins.length;
        gameCell.coins = [];

        statusPanel.innerHTML = `Your coins: ${playerCoins.join(", ")}`;
      }
    });

    // Deposit all coins
    popupDiv.querySelector("#deposit")!.addEventListener("click", () => {
      if (playerCoins.length > 0) {
        gameCell.coins = [...gameCell.coins, ...playerCoins];
        playerPoints -= playerCoins.length;
        playerCoins = [];

        statusPanel.innerHTML = `You have ${playerPoints} coin(s).`;
      }
    });

    return popupDiv;
  });

  caches.push(rects);
}

const caches: leaflet.Rectangle[] = [];

function movePlayer(deltaLat: number, deltaLng: number) {
  const currentPos = playerMarker.getLatLng();
  const newPos = leaflet.latLng(
    currentPos.lat + deltaLat,
    currentPos.lng + deltaLng,
  );

  if (deltaLat > 0) playerDirection = 0;
  else if (deltaLat < 0) playerDirection = 180;
  else if (deltaLng > 0) playerDirection = 90;
  else if (deltaLng < 0) playerDirection = 270;

  playerMarker.setLatLng(newPos);
  map.panTo(newPos);
  rotatePlayerMarker();

  for (const cache of caches) {
    const cacheBounds = cache.getBounds();
    if (cacheBounds.contains(newPos)) {
      cache.openPopup();
      break;
    }
  }
}

function rotatePlayerMarker() {
  const playerMarkerElement = document.querySelector<HTMLDivElement>(
    "#playerMarker",
  )!;
  playerMarkerElement.style.transform = `rotate(${playerDirection}deg)`;
}

document.querySelector("#north")!.addEventListener(
  "click",
  () => movePlayer(MOVE_STEP, 0),
);
document.querySelector("#south")!.addEventListener(
  "click",
  () => movePlayer(-MOVE_STEP, 0),
);
document.querySelector("#west")!.addEventListener(
  "click",
  () => movePlayer(0, -MOVE_STEP),
);
document.querySelector("#east")!.addEventListener(
  "click",
  () => movePlayer(0, MOVE_STEP),
);

document.querySelector("#reset")!.addEventListener("click", () => {
  playerMarker.setLatLng(OAKES);
  map.panTo(OAKES);
  playerDirection = 0;
  rotatePlayerMarker();
});

for (let i = -NEIGHBORHOOD_SIZE; i < NEIGHBORHOOD_SIZE; i++) {
  for (let j = -NEIGHBORHOOD_SIZE; j < NEIGHBORHOOD_SIZE; j++) {
    const lat = OAKES.lat + i * TILE_DEGREES;
    const lng = OAKES.lng + j * TILE_DEGREES;
    if (luck([lat, lng].toString()) < CACHE_SPAWN_PROBABILITY) {
      spawnCache(lat, lng);
    }
  }
}

// for some reason when i make any changes i get error git: running precommit
