<?php
if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * 1) Add top‑level menu
 */
add_action( 'admin_menu', function(){
  add_menu_page(
    'Quiz Assist',
    'Quiz Assist',
    'manage_options',
    'quiz_assist',
    'qa_render_settings_page',
    'dashicons-format-chat',
    100
  );
});

/**
 * 2) Render the settings page
 */
function qa_render_settings_page() {
  ?>
  <div class="wrap">
    <h1>Quiz Assist Settings</h1>
    <form method="post" action="options.php">
      <?php
        // prints out all hidden setting fields for this page & option-group
        settings_fields( 'quizAssist' );
        // prints out all sections & fields that we've registered
        do_settings_sections( 'quizAssist' );
        // the Save Changes button
        submit_button();
      ?>
    </form>
  </div>
  <?php
}
