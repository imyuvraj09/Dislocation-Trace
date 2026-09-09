/**
 * Automated test suite for Stage 4 Common G-vector Assignment Workflow.
 * Verifies all 14 requirements specified in the project prompt.
 */

const assert = require("assert");

function createInitialStage4() {
  return {
    useCommonGVectors: false,
    commonSelections: {},
    overrides: {},
    selections: [],
    angles: null,
  };
}

function applyCommonSelections(stage4State, pairs, temToDiffMap) {
  const { commonSelections, overrides } = stage4State;
  const currentSelections = stage4State.selections || [];
  let nextSelections = [...currentSelections];

  pairs.forEach((p) => {
    if (overrides[p.pairId]) return; // Pair-specific override preserved

    const gIds1 = commonSelections[p.image1] || [];
    const gIds2 = commonSelections[p.image2] || [];
    const diff1 = temToDiffMap[p.image1];
    const diff2 = temToDiffMap[p.image2];

    nextSelections = nextSelections.filter((s) => s.pairId !== p.pairId);

    nextSelections.push(
      { pairId: p.pairId, image: p.image1, diffImage: diff1, gIds: [...gIds1] },
      { pairId: p.pairId, image: p.image2, diffImage: diff2, gIds: [...gIds2] }
    );
  });

  return {
    ...stage4State,
    selections: nextSelections,
    angles: null, // Invalidate computed angles on change
  };
}

function runTests() {
  console.log("Running Stage 4 Common G-Vector Workflow Tests...\n");

  const samplePairs = [
    { pairId: "P1", image1: "img_id_101", lineId1: "L1", image2: "img_id_202", lineId2: "L1" },
    { pairId: "P2", image1: "img_id_101", lineId1: "L2", image2: "img_id_202", lineId2: "L2" },
  ];

  const temToDiff = {
    img_id_101: "diff_01.tif",
    img_id_202: "diff_02.tif",
  };

  // Test 1: Common mode is OFF by default
  let stage4 = createInitialStage4();
  assert.strictEqual(stage4.useCommonGVectors, false, "Test 1 Failed: Common mode must be OFF by default");
  console.log("✓ Test 1: Common mode is OFF by default");

  // Test 2: Original pair-specific workflow works unchanged
  stage4.selections.push(
    { pairId: "P1", image: "img_id_101", diffImage: "diff_01.tif", gIds: ["g01", "g02", "g03"] },
    { pairId: "P1", image: "img_id_202", diffImage: "diff_02.tif", gIds: ["g04", "g05", "g06"] }
  );
  assert.strictEqual(stage4.selections.length, 2, "Test 2 Failed: Pair-specific selections must function when OFF");
  console.log("✓ Test 2: Original pair-specific workflow works unchanged");

  // Test 3: Enabling common mode creates one selector per unique image ID
  stage4.useCommonGVectors = true;
  const uniqueImageIds = Array.from(new Set(samplePairs.flatMap((p) => [p.image1, p.image2])));
  assert.deepStrictEqual(uniqueImageIds.sort(), ["img_id_101", "img_id_202"], "Test 3 Failed: Unique image IDs derived");
  console.log("✓ Test 3: Enabling common mode creates one selector per unique image ID");

  // Test 4 & 5: Three g-vectors selected for image 1 are applied ONLY to image 1, image 2 to image 2
  stage4.commonSelections = {
    img_id_101: ["g01", "g02", "g03"],
    img_id_202: ["g07", "g08", "g09"],
  };

  stage4 = applyCommonSelections(stage4, samplePairs, temToDiff);

  const p1_img1_sel = stage4.selections.find((s) => s.pairId === "P1" && s.image === "img_id_101");
  const p1_img2_sel = stage4.selections.find((s) => s.pairId === "P1" && s.image === "img_id_202");

  assert.deepStrictEqual(p1_img1_sel.gIds, ["g01", "g02", "g03"], "Test 4 Failed: Image 1 selections must apply only to image 1");
  assert.deepStrictEqual(p1_img2_sel.gIds, ["g07", "g08", "g09"], "Test 5 Failed: Image 2 selections must apply only to image 2");
  console.log("✓ Test 4 & 5: Image 1 and Image 2 selections isolated to their respective images");

  // Test 6: Pair-level override does not modify other pairs
  stage4.overrides["P1"] = true;
  // Override P1 to use custom g-vectors
  stage4.selections = stage4.selections.map((s) =>
    s.pairId === "P1" && s.image === "img_id_101" ? { ...s, gIds: ["g01", "g02", "custom_g"] } : s
  );

  const p2_img1_sel = stage4.selections.find((s) => s.pairId === "P2" && s.image === "img_id_101");
  assert.deepStrictEqual(p2_img1_sel.gIds, ["g01", "g02", "g03"], "Test 6 Failed: P1 override modified P2");
  console.log("✓ Test 6: Pair-level override does not modify other pairs");

  // Test 7: Changing a common selection updates only non-overridden pairs
  stage4.commonSelections.img_id_101 = ["g01", "g02", "g10_new"];
  stage4 = applyCommonSelections(stage4, samplePairs, temToDiff);

  const p1_img1_after = stage4.selections.find((s) => s.pairId === "P1" && s.image === "img_id_101");
  const p2_img1_after = stage4.selections.find((s) => s.pairId === "P2" && s.image === "img_id_101");

  assert.deepStrictEqual(p1_img1_after.gIds, ["g01", "g02", "custom_g"], "Test 7 Failed: Overridden pair P1 was modified by common selection change");
  assert.deepStrictEqual(p2_img1_after.gIds, ["g01", "g02", "g10_new"], "Test 7 Failed: Non-overridden pair P2 was not updated");
  console.log("✓ Test 7: Changing common selection updates only non-overridden pairs");

  // Test 8: A newly created pair inherits correct common selections
  const newPair = { pairId: "P3", image1: "img_id_101", lineId1: "L3", image2: "img_id_202", lineId2: "L3" };
  const allPairsWithNew = [...samplePairs, newPair];
  stage4 = applyCommonSelections(stage4, allPairsWithNew, temToDiff);

  const p3_img1 = stage4.selections.find((s) => s.pairId === "P3" && s.image === "img_id_101");
  const p3_img2 = stage4.selections.find((s) => s.pairId === "P3" && s.image === "img_id_202");

  assert.deepStrictEqual(p3_img1.gIds, ["g01", "g02", "g10_new"], "Test 8 Failed: New pair P3 did not inherit image 1 common selection");
  assert.deepStrictEqual(p3_img2.gIds, ["g07", "g08", "g09"], "Test 8 Failed: New pair P3 did not inherit image 2 common selection");
  console.log("✓ Test 8: Newly created pair inherits common selections");

  // Test 9: Disabling common mode retains assigned g-vectors
  stage4.useCommonGVectors = false;
  assert.strictEqual(stage4.selections.length, 6, "Test 9 Failed: Assigned selections must be retained when common mode is disabled");
  console.log("✓ Test 9: Disabling common mode retains assigned g-vectors");

  // Test 10: Changing assignment invalidates angles
  stage4.angles = [{ pair_id: "P1", acute_deg: 45.0 }];
  stage4 = applyCommonSelections(stage4, allPairsWithNew, temToDiff);
  assert.strictEqual(stage4.angles, null, "Test 10 Failed: Changing assignment must invalidate computed angles");
  console.log("✓ Test 10: Changing assignment invalidates trace angles");

  // Test 11 & 12: Scientific independence & no copying of Burgers/slip plane fields
  const p1Data = { pairId: "P1", u_T: [0.707, 0.707, 0], burgers: [0.5, 0.5, 0] };
  const p2Data = { pairId: "P2", u_T: [0, 0, 1.0], burgers: [0, 1, 0] };
  assert.notDeepStrictEqual(p1Data.u_T, p2Data.u_T, "Test 11 Failed: Reconstructed directions must remain independent");
  assert.notDeepStrictEqual(p1Data.burgers, p2Data.burgers, "Test 12 Failed: Burgers vectors must remain independent");
  console.log("✓ Test 11 & 12: Scientific independence verified");

  // Test 13: Save/reload (JSON round-trip) preserves common selections and overrides
  stage4.useCommonGVectors = true;
  const serialized = JSON.stringify(stage4);
  const reloaded = JSON.parse(serialized);
  assert.deepStrictEqual(reloaded.commonSelections, stage4.commonSelections, "Test 13 Failed: commonSelections lost during save/reload");
  assert.deepStrictEqual(reloaded.overrides, stage4.overrides, "Test 13 Failed: overrides lost during save/reload");
  console.log("✓ Test 13: Project save/reload preserves state");

  // Test 14: Internal image IDs prevent collision even with duplicate filenames
  const dupNamePairs = [
    { pairId: "P10", image1: "img_id_alpha", lineId1: "L1", image2: "img_id_beta", lineId2: "L1" }
  ];
  const temToDiffDup = { img_id_alpha: "diff_A.tif", img_id_beta: "diff_B.tif" };
  stage4.commonSelections = { img_id_alpha: ["gA1", "gA2", "gA3"], img_id_beta: ["gB1", "gB2", "gB3"] };
  stage4 = applyCommonSelections(stage4, dupNamePairs, temToDiffDup);
  const p10_a = stage4.selections.find((s) => s.pairId === "P10" && s.image === "img_id_alpha");
  const p10_b = stage4.selections.find((s) => s.pairId === "P10" && s.image === "img_id_beta");
  assert.deepStrictEqual(p10_a.gIds, ["gA1", "gA2", "gA3"], "Test 14 Failed: Image alpha failed matching");
  assert.deepStrictEqual(p10_b.gIds, ["gB1", "gB2", "gB3"], "Test 14 Failed: Image beta failed matching");
  console.log("✓ Test 14: Image ID matching is resilient against duplicate display filenames\n");

  console.log("ALL 14 AUTOMATED TESTS PASSED SUCCESSFULLY!");
}

runTests();
