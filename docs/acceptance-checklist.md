# Kryteria akceptacji MVP (§29) — wynik

Wygenerowane 2026-10-27 z prawdziwego przebiegu `pytest` (PostgreSQL 18). Każdy punkt odhaczony tylko wtedy, gdy wszystkie wskazane testy przeszły.

### Authentication

- [x] rejestracja działa — `test_auth::test_fr_auth01_register_pending_participant_without_tokens`, `test_admin_users::test_br28_approve_then_login_works`
- [x] logowanie działa — `test_auth::test_fr_auth02_login_returns_tokens_and_is_audited`, `test_auth::test_fr_auth02_bad_credentials_do_not_reveal_which_field`
- [x] JWT działa — `test_auth::test_fr_auth03_refresh_rotates_token`, `test_auth::test_refresh_token_is_not_accepted_as_access_token`, `test_auth::test_nfr01_missing_or_bad_token_401`, `test_auth::test_adr09_reusing_spent_refresh_token_kills_the_whole_session`
- [x] role działają — `test_auth::test_fr_auth06_role_dependencies_check_membership`, `test_auth::test_fr_auth04_me_returns_profile_and_all_roles`, `test_participant_paths::test_participant_endpoints_need_participant_role`, `test_claim::test_instructor_endpoints_need_instructor_role`

### Learning paths

- [x] można utworzyć ścieżkę — `test_paths::test_fr_adm02_create_path_and_list`
- [x] można utworzyć wersję — `test_paths::test_br12_versions_numbered_and_start_closed_for_enrollment`, `test_paths::test_q07_br24_copy_version_copies_structure_content_and_permissions`
- [x] można utworzyć etap — `test_structure::test_stage_create_update_and_audit`
- [x] można utworzyć zadanie — `test_revisions::test_br19_create_makes_revision_1`, `test_structure::test_insert_task_at_position_shifts_others`
- [x] można ustawić kolejność — `test_structure::test_adr15_br16_reorder_tasks_including_swap`, `test_structure::test_reorder_stages`

### Enrollment

- [x] admin może przypisać uczestnika do ścieżki — `test_enrollments::test_fr_adm03_admin_enrolls_participant`
- [x] uczestnik widzi swoją ścieżkę — `test_participant_paths::test_fr_par01_my_paths`, `test_participant_paths::test_me_path_structure_without_statuses`

### Task locking

- [x] cała ścieżka jest widoczna — `test_participant_paths::test_br01_progress_shows_whole_path_with_statuses`
- [x] pierwsze zadanie jest dostępne — `test_task_status::test_test1_first_task_available`
- [x] kolejne są zablokowane — `test_task_status::test_test2_next_tasks_locked`
- [x] zaliczenie odblokowuje następne — `test_assessment::test_test3_pass_unlocks_next_task`, `test_task_status::test_br02_pass_unlocks_next`

### Submissions

- [x] uczestnik może wysłać zgłoszenie — `test_submissions::test_br21_draft_created_and_br14_second_open_attempt_rejected`, `test_submissions::test_br22_practical_needs_photo_theory_needs_comment_or_photo`
- [x] można dodać maksymalnie 10 zdjęć — `test_photos::test_test8_ten_photos_accepted`, `test_photos::test_test9_br08_eleventh_photo_rejected_and_nothing_saved`
- [x] można tworzyć nieograniczoną liczbę prób — `test_submissions::test_test5_test7_br03_br04_twenty_attempts_all_kept_and_next_possible`
- [x] każda próba pozostaje w historii — `test_submissions::test_test5_test7_br03_br04_twenty_attempts_all_kept_and_next_possible`, `test_submissions::test_br21_sent_submission_is_immutable`

### Instructor

- [x] instruktor widzi właściwe zgłoszenia — `test_claim::test_fr_ins01_queue_in_scope_without_own_plus_my_claims`, `test_claim::test_br24_stage_permission_covers_only_its_stage`
- [x] może przejąć zgłoszenie — `test_claim::test_fr_ins03_claim_sets_under_review_and_is_audited`
- [x] tylko pierwszy instruktor może je przejąć — `test_claim::test_test10_second_instructor_cannot_claim`, `test_claim::test_br06_spec25_parallel_claims_exactly_one_wins`
- [x] może zaliczyć — `test_assessment::test_test3_pass_unlocks_next_task`, `test_courses::test_br30_instructor_records_pass_and_it_is_final`
- [x] może skierować do poprawy — `test_assessment::test_test4_needs_improvement_keeps_next_locked_and_allows_new_attempt`, `test_assessment::test_br07_comment_required_for_needs_improvement`

### Final pass

- [x] PASSED jest ostateczne — `test_assessment::test_br05_test6_pass_is_final`, `test_db_constraints::test_br05_only_one_passed`
- [x] nie można utworzyć kolejnej próby po PASSED — `test_submissions::test_test6_br05_no_attempt_after_pass`
- [x] następne zadanie zostaje odblokowane — `test_assessment::test_test3_pass_unlocks_next_task`

### Security

- [x] frontend nie może ominąć blokad — `test_submissions::test_test12_br11_draft_for_locked_task_rejected_and_nothing_saved`, `test_submissions::test_br02_submit_rechecks_order_after_admin_reorder`
- [x] backend sprawdza uprawnienia — `test_admin_users::test_fr_adm01_admin_only`, `test_paths::test_fr_adm02_content_endpoints_are_admin_only`, `test_claim::test_br27_admin_role_alone_cannot_claim`
- [x] instruktor nie może oceniać nieuprawnionej ścieżki — `test_claim::test_test11_instructor_without_permission_cannot_claim`, `test_assessment::test_br07_assigned_instructor_without_permission_any_more_cannot_assess`
- [x] użytkownik nie może modyfikować cudzych danych — `test_submissions::test_br17_other_peoples_submissions_are_404`, `test_photos::test_br17_photo_of_someone_else_is_404`, `test_db_constraints::test_br25_no_self_assessment`

### Audit

- [x] kluczowe operacje są zapisywane — `test_audit::test_br18_every_catalogued_action_is_written`, `test_audit::test_br18_rejected_operation_leaves_no_entry`

### Tests

- [x] wszystkie testy automatyczne przechodzą — 253 z 253
