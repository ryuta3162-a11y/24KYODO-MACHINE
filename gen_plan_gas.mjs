import fs from "fs";

const payload = JSON.parse(
  fs.readFileSync(
    "C:/Users/r-kus/Github/24KYODO-MACHINE/gas/_plan_payload.json",
    "utf8"
  )
);

const code = `/**
 * Kyodo idea pool: overwrite New Machines sheet in plan format
 */
var IDEA_SHEET_ID = '1YR4UNjOHT-AManewnSOEPxuR01kBVwXfgoCAjDsPeOw';
var NEW_SHEET = '新マシン';
var RULES_SHEET = '図面規則';
var BACKUP_SHEET = '新マシン_バックアップ';

function doGet(e) {
  try {
    var msg = overwriteNewMachinesPlanFormat();
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, message: msg }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err && err.message ? err.message : err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function overwriteNewMachinesPlanFormat() {
  var ss = SpreadsheetApp.openById(IDEA_SHEET_ID);
  backupIfNeeded_(ss);
  writeMachines_(ss);
  writeRules_(ss);
  return 'OK plan-format overwrite + rules tab';
}

function backupIfNeeded_(ss) {
  var src = ss.getSheetByName(NEW_SHEET);
  if (!src) return;
  var old = ss.getSheetByName(BACKUP_SHEET);
  if (old) ss.deleteSheet(old);
  src.copyTo(ss).setName(BACKUP_SHEET);
}

function writeMachines_(ss) {
  var sh = ss.getSheetByName(NEW_SHEET);
  if (!sh) sh = ss.insertSheet(NEW_SHEET);
  var values = PLAN_MACHINES_();
  sh.clear();
  sh.getRange(1, 1, values.length, values[0].length).setValues(values);
  sh.setFrozenRows(1);
}

function writeRules_(ss) {
  var sh = ss.getSheetByName(RULES_SHEET);
  if (!sh) sh = ss.insertSheet(RULES_SHEET);
  var values = PLAN_RULES_();
  sh.clear();
  sh.getRange(1, 1, values.length, values[0].length).setValues(values);
  sh.setFrozenRows(1);
}

function PLAN_MACHINES_() {
  return ${JSON.stringify(payload.machines)};
}

function PLAN_RULES_() {
  return ${JSON.stringify(payload.rules)};
}
`;

const dir = "C:/Users/r-kus/AppData/Local/Temp/kyodo-plan-gas";
fs.writeFileSync(`${dir}/Code.js`, code);
fs.writeFileSync(
  `${dir}/appsscript.json`,
  JSON.stringify(
    {
      timeZone: "Asia/Tokyo",
      dependencies: {},
      exceptionLogging: "STACKDRIVER",
      runtimeVersion: "V8",
      oauthScopes: [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/script.scriptapp",
      ],
    },
    null,
    2
  )
);
console.log("wrote", `${dir}/Code.js`, "bytes", Buffer.byteLength(code));
