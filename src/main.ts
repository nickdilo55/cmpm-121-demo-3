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
}" style="width: 24px; height: 24px;" />
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

  // Save all cache states to localStorage
  save() {
    const cacheStates: { [key: string]: string[] } = {};
    this.cells.forEach((gameCell, key) => {
      cacheStates[key] = gameCell.coins;
    });
    localStorage.setItem("cacheStates", JSON.stringify(cacheStates));
  }

  // Load all cache states from localStorage
  load() {
    const savedCacheStates = localStorage.getItem("cacheStates");
    if (savedCacheStates) {
      const cacheStates = JSON.parse(savedCacheStates);

      // Loop over all keys in the cacheStates object
      for (const key in cacheStates) {
        const coins = cacheStates[key];
        const [lat, lng] = key.split(":").map(Number);
        const gameCell = this.getCell(lat, lng);
        gameCell.coins = coins;
      }
    }
  }
}

const gameCellFactory = new GameCellFactory();

const visitedRegions = new Set<string>();

// Function to save player coins to localStorage
function savePlayerCoins() {
  localStorage.setItem("playerCoins", JSON.stringify(playerCoins));
}

// Function to load player coins from localStorage
function loadPlayerCoins() {
  const savedCoins = localStorage.getItem("playerCoins");
  if (savedCoins) {
    playerCoins = JSON.parse(savedCoins);
    statusPanel.innerHTML = `Your coins: ${playerCoins.join(", ")}`;
  } else {
    statusPanel.innerHTML = "You have no coins yet.";
  }
}

function saveCacheState() {
  const cacheStates: { [key: string]: string[] } = {};

  // Loop over all cells in the gameCellFactory's cells Map
  gameCellFactory["cells"].forEach((gameCell, key) => {
    cacheStates[key] = gameCell.coins;
  });

  // Save the cache state to localStorage
  localStorage.setItem("cacheStates", JSON.stringify(cacheStates));
}

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

  // Add the cache to the caches array
  caches.push(rects); // Add cache to the array so we can remove it later

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

    popupDiv.querySelector("#poke")!.addEventListener("click", () => {
      if (gameCell.coins.length > 0) {
        playerCoins = [...playerCoins, ...gameCell.coins];
        playerPoints += gameCell.coins.length;
        gameCell.coins = [];
        savePlayerCoins();
        saveCacheState();
        statusPanel.innerHTML = `Your coins: ${playerCoins.join(", ")}`;
      }
    });

    popupDiv.querySelector("#deposit")!.addEventListener("click", () => {
      if (playerCoins.length > 0) {
        gameCell.coins = [...gameCell.coins, ...playerCoins];
        playerPoints -= playerCoins.length;
        playerCoins = [];
        savePlayerCoins();
        saveCacheState();
        statusPanel.innerHTML = `You have ${playerPoints} coin(s).`;
      }
    });

    return popupDiv;
  });
}

const caches: leaflet.Rectangle[] = [];

function exploreNewRegions() {
  const currentLat = playerMarker.getLatLng().lat;
  const currentLng = playerMarker.getLatLng().lng;

  for (let i = -NEIGHBORHOOD_SIZE; i < NEIGHBORHOOD_SIZE; i++) {
    for (let j = -NEIGHBORHOOD_SIZE; j < NEIGHBORHOOD_SIZE; j++) {
      const lat = currentLat + i * TILE_DEGREES;
      const lng = currentLng + j * TILE_DEGREES;
      const regionKey = `${Math.floor(lat / TILE_DEGREES)}:${
        Math.floor(
          lng / TILE_DEGREES,
        )
      }`;

      if (!visitedRegions.has(regionKey)) {
        visitedRegions.add(regionKey);

        if (luck([lat, lng].toString()) < CACHE_SPAWN_PROBABILITY) {
          spawnCache(lat, lng);
        }
      }
    }
  }
}

let playerPath: leaflet.LatLng[] = [];

const playerPathPolyline = leaflet.polyline(playerPath, {
  color: "blue",
  weight: 3,
  opacity: 0.5,
}).addTo(map);

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
  exploreNewRegions();

  playerPath.push(newPos);

  playerPathPolyline.setLatLngs(playerPath);

  savePlayerState(newPos, playerDirection, playerCoins, playerPoints);
}

function rotatePlayerMarker() {
  const playerMarkerElement = document.querySelector<HTMLDivElement>(
    "#playerMarker",
  )!;
  playerMarkerElement.style.transform = `rotate(${playerDirection}deg)`;
}

function savePlayerState(
  latLng: leaflet.LatLng,
  direction: number,
  coins: string[],
  points: number,
) {
  const state = {
    lat: latLng.lat,
    lng: latLng.lng,
    direction: direction,
    coins: coins,
    points: points,
  };
  localStorage.setItem("playerState", JSON.stringify(state));
}

function loadPlayerState() {
  const state = localStorage.getItem("playerState");
  if (state) {
    const { lat, lng, direction, coins, points } = JSON.parse(state);
    playerCoins = coins;
    playerPoints = points;
    playerDirection = direction;

    const savedPosition = leaflet.latLng(lat, lng);
    playerMarker.setLatLng(savedPosition);
    map.panTo(savedPosition);
    rotatePlayerMarker();

    statusPanel.innerHTML = `Your coins: ${
      playerCoins.join(", ")
    }. Points: ${playerPoints}`;
  }
}

let watchId: number | null = null;
let isGeolocationEnabled = false;

document.querySelector("#sensor")!.addEventListener("click", () => {
  if (isGeolocationEnabled) {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
    }
    statusPanel.innerHTML = "Geolocation disabled.";
    isGeolocationEnabled = false;
  } else {
    watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        playerMarker.setLatLng(leaflet.latLng(latitude, longitude));
        map.panTo(leaflet.latLng(latitude, longitude));
        statusPanel.innerHTML = "Tracking your location...";
      },
      () => {
        statusPanel.innerHTML = "Geolocation permission denied.";
      },
      { enableHighAccuracy: true },
    );
    isGeolocationEnabled = true;
    statusPanel.innerHTML = "Tracking your location...";
  }
});

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
  // Reset player position and direction
  playerMarker.setLatLng(OAKES);
  map.panTo(OAKES);
  playerDirection = 0;
  rotatePlayerMarker();

  // Reset coins and points
  playerCoins = []; // Clear the player's coins
  playerPoints = 0;
  statusPanel.innerHTML = "You have no coins yet.";

  // Remove all cache markers from the map and clear coins in caches
  caches.forEach((cache) => {
    cache.remove();
    // Reset coins for each cache
    const cacheLatLng = cache.getBounds().getCenter();
    const gameCell = gameCellFactory.getCell(cacheLatLng.lat, cacheLatLng.lng);
    gameCell.coins = []; // Clear coins in each cache
  });

  // Clear the caches array
  caches.length = 0;

  // Clear game cells and visited regions
  gameCellFactory.clear();
  visitedRegions.clear();

  // Disable geolocation tracking if enabled
  if (isGeolocationEnabled) {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
    }
    isGeolocationEnabled = false;
  }

  // Clear player path and polyline
  playerPath = [];
  playerPathPolyline.setLatLngs(playerPath);

  // Reset status panel and localStorage
  statusPanel.innerHTML = "Game reset. You have no coins yet.";

  // Remove player state and coin data from localStorage
  localStorage.removeItem("playerState");
  localStorage.removeItem("playerCoins");
  localStorage.removeItem("cacheStates");

  // Reload initial game state and UI
  loadPlayerState();
  loadPlayerCoins();
  gameCellFactory.load();
});

exploreNewRegions();

loadPlayerState();
loadPlayerCoins();
gameCellFactory.load();
