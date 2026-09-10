-- Remap actor ids written before named demo users existed onto the current DEMO_USERS
-- ids, so holders of seeded/in-flight cases can still act on them. Audit rows are
-- deliberately untouched: they record who acted at the time and must not be rewritten.

UPDATE kyc_case_workflow SET assignee_id = CASE assignee_id
  WHEN 'user_compliance_1' THEN 'user_casey'
  WHEN 'demo_compliance' THEN 'user_casey'
  WHEN 'user_manager_1' THEN 'user_morgan'
  WHEN 'user_admin_1' THEN 'user_morgan'
  WHEN 'demo_manager-admin' THEN 'user_morgan'
  WHEN 'user_support_1' THEN 'user_sam'
  WHEN 'demo_support' THEN 'user_sam'
  WHEN 'user_release_engineer_1' THEN 'user_riley'
  WHEN 'demo_release-engineer' THEN 'user_riley'
  ELSE assignee_id END
WHERE assignee_id IN (
  'user_compliance_1', 'demo_compliance',
  'user_manager_1', 'user_admin_1', 'demo_manager-admin',
  'user_support_1', 'demo_support',
  'user_release_engineer_1', 'demo_release-engineer'
);
--> statement-breakpoint
UPDATE kyc_case_workflow SET decided_by = CASE decided_by
  WHEN 'user_compliance_1' THEN 'user_casey'
  WHEN 'demo_compliance' THEN 'user_casey'
  WHEN 'user_manager_1' THEN 'user_morgan'
  WHEN 'user_admin_1' THEN 'user_morgan'
  WHEN 'demo_manager-admin' THEN 'user_morgan'
  WHEN 'user_support_1' THEN 'user_sam'
  WHEN 'demo_support' THEN 'user_sam'
  WHEN 'user_release_engineer_1' THEN 'user_riley'
  WHEN 'demo_release-engineer' THEN 'user_riley'
  ELSE decided_by END
WHERE decided_by IN (
  'user_compliance_1', 'demo_compliance',
  'user_manager_1', 'user_admin_1', 'demo_manager-admin',
  'user_support_1', 'demo_support',
  'user_release_engineer_1', 'demo_release-engineer'
);
--> statement-breakpoint
UPDATE refund_case_workflow SET requested_by = CASE requested_by
  WHEN 'user_compliance_1' THEN 'user_casey'
  WHEN 'demo_compliance' THEN 'user_casey'
  WHEN 'user_manager_1' THEN 'user_morgan'
  WHEN 'user_admin_1' THEN 'user_morgan'
  WHEN 'demo_manager-admin' THEN 'user_morgan'
  WHEN 'user_support_1' THEN 'user_sam'
  WHEN 'demo_support' THEN 'user_sam'
  WHEN 'user_release_engineer_1' THEN 'user_riley'
  WHEN 'demo_release-engineer' THEN 'user_riley'
  ELSE requested_by END
WHERE requested_by IN (
  'user_compliance_1', 'demo_compliance',
  'user_manager_1', 'user_admin_1', 'demo_manager-admin',
  'user_support_1', 'demo_support',
  'user_release_engineer_1', 'demo_release-engineer'
);
--> statement-breakpoint
UPDATE refund_case_workflow SET approved_by = CASE approved_by
  WHEN 'user_compliance_1' THEN 'user_casey'
  WHEN 'demo_compliance' THEN 'user_casey'
  WHEN 'user_manager_1' THEN 'user_morgan'
  WHEN 'user_admin_1' THEN 'user_morgan'
  WHEN 'demo_manager-admin' THEN 'user_morgan'
  WHEN 'user_support_1' THEN 'user_sam'
  WHEN 'demo_support' THEN 'user_sam'
  WHEN 'user_release_engineer_1' THEN 'user_riley'
  WHEN 'demo_release-engineer' THEN 'user_riley'
  ELSE approved_by END
WHERE approved_by IN (
  'user_compliance_1', 'demo_compliance',
  'user_manager_1', 'user_admin_1', 'demo_manager-admin',
  'user_support_1', 'demo_support',
  'user_release_engineer_1', 'demo_release-engineer'
);
