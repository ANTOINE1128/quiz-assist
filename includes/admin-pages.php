<?php
add_action('admin_menu','qa_admin_menu');
function qa_admin_menu(){
    add_menu_page(
      'Quiz Assist Settings',
      'Quiz Assist',
      'manage_options',
      'quiz_assist',
      'qa_options_page',
      'dashicons-admin-site-alt3',
      80
    );
}

function qa_options_page() { ?>
  <div class="wrap">
    <h1>Quiz Assist Settings</h1>
    <form action="options.php" method="post">
      <?php
        settings_fields('quizAssist');
        do_settings_sections('quizAssist');
        submit_button();
      ?>
    </form>
  </div>
<?php }
