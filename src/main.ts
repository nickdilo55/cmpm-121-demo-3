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

let playerPoints = 0;
const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!;
statusPanel.innerHTML = "You have no coins yet.";

const cacheValues = new Map<string, number>();

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

function spawnCache(i: number, j: number) {
  const origin = OAKES;
  const bounds = leaflet.latLngBounds([
    [origin.lat + i * TILE_DEGREES, origin.lng + j * TILE_DEGREES],
    [origin.lat + (i + 1) * TILE_DEGREES, origin.lng + (j + 1) * TILE_DEGREES],
  ]);
  const rects = leaflet.rectangle(bounds);
  rects.bindTooltip("You found a cache!");
  rects.addTo(map);

  const key = `${i},${j}`;
  if (!cacheValues.has(key)) {
    const initialValue = Math.floor(
      luck([i, j, "initialValue"].toString()) * 100,
    );
    cacheValues.set(key, initialValue);
  }

  rects.bindPopup(() => {
    let pointVal = cacheValues.get(key)!;

    const popupDiv = document.createElement("div");
    popupDiv.innerHTML = `
      <div> This cache is at "${i}, ${j}" and contains <span id="value">${pointVal}</span> coin(s). </div>
      <button id="poke" style="color: lightblue;">Collect</button>
      <button id="deposit" style="color: lightblue;">Deposit</button>`;

    popupDiv.querySelector("#poke")!.addEventListener("click", () => {
      if (pointVal > 0) {
        playerPoints += pointVal;
        cacheValues.set(key, 0);
        popupDiv.querySelector<HTMLSpanElement>("#value")!.innerHTML = "0";
        statusPanel.innerHTML = `You have ${playerPoints} coin(s).`;
      }
    });

    popupDiv.querySelector("#deposit")!.addEventListener("click", () => {
      if (playerPoints > 0) {
        pointVal += playerPoints;
        cacheValues.set(key, pointVal);
        playerPoints = 0;
        popupDiv.querySelector<HTMLSpanElement>("#value")!.innerHTML = pointVal
          .toString();
        statusPanel.innerHTML = `You have ${playerPoints} coin(s).`;
      }
    });

    return popupDiv;
  });
  caches.push(rects);
}

const caches: leaflet.Rectangle[] = [];

for (let i = -NEIGHBORHOOD_SIZE; i < NEIGHBORHOOD_SIZE; i++) {
  for (let j = -NEIGHBORHOOD_SIZE; j < NEIGHBORHOOD_SIZE; j++) {
    if (luck([i, j].toString()) < CACHE_SPAWN_PROBABILITY) {
      spawnCache(i, j);
    }
  }
}
