import { validatePersonaCalibrationRepository } from "../stock-pro-council-calibration-repository.js";

const result = validatePersonaCalibrationRepository();
for (const issue of result.issues) {
  console.log(`${issue.severity.toUpperCase()} ${issue.code} ${issue.target}: ${issue.message}`);
}

const errors = result.issues.filter((issue) => issue.severity === "error");
console.log(
  `Persona calibration: records=${result.calibrationCount} activeHeads=${result.activeHeadCount} eligibleHeads=${result.eligibleHeadCount} errors=${errors.length} warnings=${result.issues.length - errors.length}`,
);
if (errors.length > 0) {
  process.exitCode = 1;
} else if (result.calibrationCount === 0) {
  console.log("Calibration contracts are valid, but no local calibration record exists. Calibration milestone remains unproven.");
} else {
  console.log("✓ COUNCIL_CALIBRATION_RECORDS_VALID");
  console.log("Weight changes remain recommendations only and require explicit human approval.");
}
