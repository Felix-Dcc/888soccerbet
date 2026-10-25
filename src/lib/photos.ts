/**
 * Site photography. Two sets:
 *  - public/img/*.jpg      — Unsplash License (see public/img/CREDITS.md)
 *  - public/img/pin/*.jpg  — from Pinterest, LICENCE PENDING (see public/img/pin/CREDITS.md):
 *    the owner is sourcing licences; replace any that can't be licensed.
 * All generic: no identifiable players, club crests, kits or sponsor brands.
 * Static imports give next/image the dimensions and a blur placeholder for free.
 */
import pitchAerial from "../../public/img/pitch-aerial.jpg";
import pitchAerialPortrait from "../../public/img/pitch-aerial-portrait.jpg";
import stadiumNight from "../../public/img/stadium-night.jpg";
import stadiumCrowd from "../../public/img/stadium-crowd.jpg";
import pitchLine from "../../public/img/pitch-line.jpg";
import basketballHoop from "../../public/img/basketball-hoop.jpg";
import footballBallFloodlit from "../../public/img/pin/football-ball-floodlit.jpg";
import footballStadiumWide from "../../public/img/pin/football-stadium-wide.jpg";
import footballPitchCorner from "../../public/img/pin/football-pitch-corner.jpg";
import footballBallSpotlight from "../../public/img/pin/football-ball-spotlight.jpg";
import footballStadiumCrowd from "../../public/img/pin/football-stadium-crowd.jpg";
import footballStadiumDusk from "../../public/img/pin/football-stadium-dusk.jpg";
import footballStadiumLights from "../../public/img/pin/football-stadium-lights.jpg";
import footballStadiumBlue from "../../public/img/pin/football-stadium-blue.jpg";
import footballBallNight from "../../public/img/pin/football-ball-night.jpg";
import basketballHoopCourt from "../../public/img/pin/basketball-hoop-court.jpg";
import basketballDribbleSilhouette from "../../public/img/pin/basketball-dribble-silhouette.jpg";
import basketballRimSmoke from "../../public/img/pin/basketball-rim-smoke.jpg";
import basketballCourtNight from "../../public/img/pin/basketball-court-night.jpg";
import basketballBallWetCourt from "../../public/img/pin/basketball-ball-wet-court.jpg";

export const photos = {
  pitchAerial,
  pitchAerialPortrait,
  stadiumNight,
  stadiumCrowd,
  pitchLine,
  basketballHoop,
  footballBallFloodlit,
  footballStadiumWide,
  footballPitchCorner,
  footballBallSpotlight,
  footballStadiumCrowd,
  footballStadiumDusk,
  footballStadiumLights,
  footballStadiumBlue,
  footballBallNight,
  basketballHoopCourt,
  basketballDribbleSilhouette,
  basketballRimSmoke,
  basketballCourtNight,
  basketballBallWetCourt,
};

/** Wide scene for a sport (tiles, match header): neutral venue, never a club's stadium. */
export const sportPhoto = (sportKey: string) => (sportKey === "basketball" ? basketballHoopCourt : footballStadiumWide);

/** Close-up for a sport's hero banner. */
export const sportBannerPhoto = (sportKey: string) => (sportKey === "basketball" ? basketballHoopCourt : footballBallFloodlit);
