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
const CACHE_VISIBILITY_RADIUS = 50;

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

class CacheMemento {
  constructor(public coins: string[]) {}
}

class CacheCaretaker {
  private mementos: Map<string, CacheMemento> = new Map();

  save(key: string, memento: CacheMemento) {
    this.mementos.set(key, memento);
  }

  load(key: string): CacheMemento | undefined {
    return this.mementos.get(key);
  }

  saveToLocalStorage() {
    const serialized = JSON.stringify(
      Array.from(this.mementos.entries()).map(([key, memento]) => ({
        key,
        coins: memento.coins,
      })),
    );
    localStorage.setItem("cacheMementos", serialized);
  }

  loadFromLocalStorage() {
    const serialized = localStorage.getItem("cacheMementos");
    if (serialized) {
      const data = JSON.parse(serialized);
      this.mementos.clear();
      for (const { key, coins } of data) {
        this.mementos.set(key, new CacheMemento(coins));
      }
    }
  }
}

const cacheCaretaker = new CacheCaretaker();
cacheCaretaker.loadFromLocalStorage();

class GameCellFactory {
  private cells: Map<string, GameCell> = new Map();

  getCell(lat: number, lng: number): GameCell {
    const key = `${lat}:${lng}`;
    if (!this.cells.has(key)) {
      const memento = cacheCaretaker.load(key);
      const coins = memento ? memento.coins : [];
      this.cells.set(key, new GameCell(lat, lng, coins));
    }
    return this.cells.get(key)!;
  }

  save() {
    this.cells.forEach((gameCell, key) => {
      const memento = new CacheMemento(gameCell.coins);
      cacheCaretaker.save(key, memento);
    });
    cacheCaretaker.saveToLocalStorage();
  }

  load() {
    cacheCaretaker.loadFromLocalStorage();
    this.cells = new Map();
  }

  // Add the clear method
  clear() {
    this.cells.clear();
  }
}

const gameCellFactory = new GameCellFactory();

const visitedRegions = new Set<string>();

function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

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
  gameCellFactory.save();
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

  // Add the cache to the map but hide it initially
  rects.addTo(map);
  rects.setStyle({ opacity: 0, fillOpacity: 0 });

  // Add the cache to the array for management
  caches.push(rects);

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

function updateCacheVisibility() {
  const playerPos = playerMarker.getLatLng();
  caches.forEach((cache) => {
    const cacheBounds = cache.getBounds();
    const cacheCenter = cacheBounds.getCenter();

    const distance = calculateDistance(
      playerPos.lat,
      playerPos.lng,
      cacheCenter.lat,
      cacheCenter.lng,
    );

    if (distance <= CACHE_VISIBILITY_RADIUS) {
      cache.setStyle({ opacity: 1, fillOpacity: 0.5 });
    } else {
      cache.setStyle({ opacity: 0, fillOpacity: 0 });
    }
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

  // Update cache visibility
  updateCacheVisibility();
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

    gameCellFactory.load(); // Load cache state
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
