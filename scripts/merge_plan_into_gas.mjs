import fs from "fs";

const payload = JSON.parse(fs.readFileSync("gas/_plan_payload.json", "utf8"));
let existing = fs.readFileSync("gas/Code.js", "utf8");
const marker = "/** PLAN_FORMAT_OVERWRITE */";
const idx = existing.indexOf(marker);
if (idx >= 0) existing = existing.slice(0, idx).trimEnd() + "\n";

// Ensure doGet supports plan overwrite op
if (!existing.includes("update-plan-format")) {
  existing = existing.replace(
    'if (op === "update-new-dims") {\n      var msg = updateNewMachinesVerified();',
    'if (op === "update-plan-format") {\n      var msg = overwriteNewMachinesPlanFormat();\n      return json_({ ok: true, op: op, message: msg, at: new Date().toISOString() });\n    }\n    if (op === "update-new-dims") {\n      var msg = updateNewMachinesVerified();'
  );
  // also support without escaped quotes depending on file style
  existing = existing.replace(
    "if (op === 'update-new-dims') {\n      var msg = updateNewMachinesVerified();",
    "if (op === 'update-plan-format') {\n      var msg = overwriteNewMachinesPlanFormat();\n      return json_({ ok: true, op: op, message: msg, at: new Date().toISOString() });\n    }\n    if (op === 'update-new-dims') {\n      var msg = updateNewMachinesVerified();"
  );
}

const add = `
${marker}
var PLAN_NEW_SHEET = '新マシン';
var PLAN_RULES_SHEET = '図面規則';
var PLAN_BACKUP_SHEET = '新マシン_バックアップ';

function overwriteNewMachinesPlanFormat() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var src = ss.getSheetByName(PLAN_NEW_SHEET);
  if (src) {
    var old = ss.getSheetByName(PLAN_BACKUP_SHEET);
    if (old) ss.deleteSheet(old);
    src.copyTo(ss).setName(PLAN_BACKUP_SHEET);
  }
  var sh = ss.getSheetByName(PLAN_NEW_SHEET) || ss.insertSheet(PLAN_NEW_SHEET);
  var values = ${JSON.stringify(payload.machines)};
  sh.clear();
  sh.getRange(1, 1, values.length, values[0].length).setValues(values);
  sh.setFrozenRows(1);
  var rh = ss.getSheetByName(PLAN_RULES_SHEET) || ss.insertSheet(PLAN_RULES_SHEET);
  var rules = ${JSON.stringify(payload.rules)};
  rh.clear();
  rh.getRange(1, 1, rules.length, rules[0].length).setValues(rules);
  rh.setFrozenRows(1);
  return 'OK plan-format overwrite';
}
`;

fs.writeFileSync("gas/Code.js", existing.trimEnd() + "\n" + add);
fs.writeFileSync(
  "gas/appsscript.json",
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
      webapp: {
        executeAs: "USER_DEPLOYING",
        access: "ANYONE_ANONYMOUS",
      },
    },
    null,
    2
  )
);
console.log("updated gas/Code.js", fs.statSync("gas/Code.js").size);
