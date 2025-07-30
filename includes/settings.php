<?php
if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * Register *all* our settings, sections & fields.
 */
add_action( 'admin_init', 'qa_settings_init' );
function qa_settings_init() {
  // register the single option that holds everything
  register_setting(
    'quizAssist',
    'quiz_assist_options',
    'qa_sanitize_options'
  );

  // a single section for everything
  add_settings_section(
    'qa_section',
    'Quiz Assist Settings',
    '__return_false',
    'quizAssist'
  );

  // 1) API Key
  add_settings_field(
    'qa_openai_key',
    'OpenAI API Key',
    'qa_render_text',
    'quizAssist',
    'qa_section',
    [ 'field'=>'qa_openai_key','type'=>'text' ]
  );

  // 2) Model selector
  add_settings_field(
    'qa_model',
    'OpenAI Model',
    'qa_render_model',
    'quizAssist',
    'qa_section'
  );

  // 3) Quiz‑widget buttons
  add_settings_field(
    'qa_quiz_actions',
    'Quiz Widget Actions',
    'qa_render_actions',
    'quizAssist',
    'qa_section'
  );


// 4) Global‑chat buttons
add_settings_field(
  'qa_global_actions',
  'Global Chat Quick‑Replies',
  'qa_render_global_actions',
  'quizAssist',   // ← correct page slug
  'qa_section'    // ← correct section id
);
}

/**
 * Renders a simple <input type=text>
 */
function qa_render_text( $args ) {
  $opts = get_option( 'quiz_assist_options', [] );
  $val  = isset( $opts[ $args['field'] ] )
         ? trim( $opts[ $args['field'] ] )
         : '';
  printf(
    '<input type="%1$s" name="quiz_assist_options[%2$s]" value="%3$s" class="regular-text"/>',
    esc_attr( $args['type'] ),
    esc_attr( $args['field'] ),
    esc_attr( $val )
  );
}

/**
 * Renders the model <select>
 */
function qa_render_model() {
  $opts    = get_option( 'quiz_assist_options', [] );
  $current = $opts['qa_model'] ?? 'gpt-4';
  $apikey  = trim( $opts['qa_openai_key'] ?? '' );

  if ( ! $apikey ) {
    echo '<p style="color:red;">Enter your OpenAI API Key above to load models.</p>';
    return;
  }

  // fetch models from OpenAI
  $resp = wp_remote_get( 'https://api.openai.com/v1/models', [
    'headers' => [
      'Authorization' => "Bearer {$apikey}",
    ],
    'timeout' => 20,
  ] );
  if ( is_wp_error( $resp ) ) {
    echo '<p style="color:red;">Error fetching models: '
       . esc_html( $resp->get_error_message() )
       . '</p>';
    return;
  }

  $data = json_decode( wp_remote_retrieve_body( $resp ), true );
  if ( empty( $data['data'] ) || ! is_array( $data['data'] ) ) {
    echo '<p style="color:red;">Unexpected response when fetching models.</p>';
    return;
  }

  $models = array_column( $data['data'], 'id' );
  sort( $models, SORT_NATURAL );

  echo '<select name="quiz_assist_options[qa_model]">';
  foreach ( $models as $m ) {
    printf(
      '<option value="%1$s"%2$s>%1$s</option>',
      esc_attr( $m ),
      selected( $current, $m, false )
    );
  }
  echo '</select>';
}

/**
 * Quiz‑widget actions repeater
 */
function qa_render_actions() {
  $opts    = get_option( 'quiz_assist_options', [] );
  $actions = $opts['qa_quiz_actions'] ?? [];

  echo '<div class="qa-card">';
  echo '<div class="qa-placeholders">';
  foreach ( ['{question}','{list}','{correct}','{incorrect}'] as $ph ) {
    printf('<span class="qa-chip">%s</span>', esc_html($ph));
  }
  echo '<p class="description">Use these placeholders in your <em>User Prompt</em>.</p>';
  echo '</div>';

  // table
  ?>
  <table id="qa-actions-table">
    <thead>
      <tr>
        <th>Label</th><th>System Prompt</th><th>User Prompt</th><th>Remove</th>
      </tr>
    </thead>
    <tbody>
      <?php foreach( $actions as $i => $act ): ?>
        <tr>
          <td><input name="quiz_assist_options[qa_quiz_actions][<?= $i ?>][label]"
                     value="<?= esc_attr($act['label']) ?>"/></td>
          <td><textarea name="quiz_assist_options[qa_quiz_actions][<?= $i ?>][sys]"
                        rows="2"><?= esc_textarea($act['sys']) ?></textarea></td>
          <td><textarea name="quiz_assist_options[qa_quiz_actions][<?= $i ?>][user]"
                        rows="2"><?= esc_textarea($act['user']) ?></textarea></td>
          <td><button class="button qa-remove-action">Delete</button></td>
        </tr>
      <?php endforeach; ?>
    </tbody>
  </table>
  <p><button id="qa-add-action" class="button">+ Add Button</button></p>

  <template id="qa-action-row-template">
    <tr>
      <td><input/></td>
      <td><textarea rows="2"></textarea></td>
      <td><textarea rows="2"></textarea></td>
      <td><button class="button qa-remove-action">Delete</button></td>
    </tr>
  </template>

  <script>
  (function($){
    let tbody = $('#qa-actions-table tbody');
    $('#qa-add-action').click(function(e){
      e.preventDefault();
      let idx = tbody.children().length;
      let row = $($('#qa-action-row-template').html());
      row.find('input')
         .attr('name',`quiz_assist_options[qa_quiz_actions][${idx}][label]`);
      row.find('textarea').eq(0)
         .attr('name',`quiz_assist_options[qa_quiz_actions][${idx}][sys]`);
      row.find('textarea').eq(1)
         .attr('name',`quiz_assist_options[qa_quiz_actions][${idx}][user]`);
      tbody.append(row);
    });
    $(document).on('click','.qa-remove-action',function(e){
      e.preventDefault();
      $(this).closest('tr').remove();
    });
  })(jQuery);
  </script>
  <?php
  echo '</div>';
}

/**
 * Global‑chat actions repeater
 */
function qa_render_global_actions() {
  $opts    = get_option( 'quiz_assist_options', [] );
  $actions = $opts['qa_global_actions'] ?? [];

  echo '<div class="qa-card">';
  echo '<p class="description">These buttons appear on every page (except quizzes) in the global chat. Click to send a pre‑built question.</p>';

  ?>
  <table id="qa-global-actions-table">
    <thead>
      <tr><th>Label</th><th>System Prompt</th><th>User Prompt</th><th>Remove</th></tr>
    </thead>
    <tbody>
      <?php foreach( $actions as $i => $act ): ?>
      <tr>
        <td><input name="quiz_assist_options[qa_global_actions][<?= $i ?>][label]"
                   value="<?= esc_attr($act['label']) ?>"/></td>
        <td><textarea name="quiz_assist_options[qa_global_actions][<?= $i ?>][sys]"
                      rows="2"><?= esc_textarea($act['sys']) ?></textarea></td>
        <td><textarea name="quiz_assist_options[qa_global_actions][<?= $i ?>][user]"
                      rows="2"><?= esc_textarea($act['user']) ?></textarea></td>
        <td><button class="button qa-remove-global">Delete</button></td>
      </tr>
      <?php endforeach; ?>
    </tbody>
  </table>
  <p><button id="qa-add-global" class="button">+ Add Button</button></p>

  <template id="qa-global-row-tpl">
    <tr>
      <td><input/></td>
      <td><textarea rows="2"></textarea></td>
      <td><textarea rows="2"></textarea></td>
      <td><button class="button qa-remove-global">Delete</button></td>
    </tr>
  </template>

  <script>
  (function($){
    let tbody = $('#qa-global-actions-table tbody');
    $('#qa-add-global').click(e=>{
      e.preventDefault();
      let idx = tbody.children().length;
      let row = $($('#qa-global-row-tpl').html());
      row.find('input')
         .attr('name',`quiz_assist_options[qa_global_actions][${idx}][label]`);
      row.find('textarea').eq(0)
         .attr('name',`quiz_assist_options[qa_global_actions][${idx}][sys]`);
      row.find('textarea').eq(1)
         .attr('name',`quiz_assist_options[qa_global_actions][${idx}][user]`);
      tbody.append(row);
    });
    $(document).on('click','.qa-remove-global',function(e){
      e.preventDefault();
      $(this).closest('tr').remove();
    });
  })(jQuery);
  </script>
  <?php
  echo '</div>';
}

/**
 * Sanitize everything on save.
 */
function qa_sanitize_options( $input ) {
  $clean = [];

  // API key
  $clean['qa_openai_key']   = sanitize_text_field( trim( $input['qa_openai_key'] ?? '' ) );
  // model
  $clean['qa_model']        = sanitize_text_field( trim( $input['qa_model'] ?? 'gpt-4' ) );

  // quiz_actions
  $clean['qa_quiz_actions'] = [];
  if ( ! empty( $input['qa_quiz_actions'] ) && is_array( $input['qa_quiz_actions'] ) ) {
    foreach ( $input['qa_quiz_actions'] as $act ) {
      $lab = sanitize_text_field( trim( $act['label'] ?? '' ) );
      $sys = wp_kses_post(      trim( $act['sys']   ?? '' ) );
      $usr = wp_kses_post(      trim( $act['user']  ?? '' ) );
      if ( $lab && $sys && $usr ) {
        $clean['qa_quiz_actions'][] = compact( 'lab','sys','usr' );
      }
    }
    // rename keys back to label/sys/user
    $clean['qa_quiz_actions'] = array_map(function($a){
      return [ 'label'=>$a['lab'],'sys'=>$a['sys'],'user'=>$a['usr'] ];
    }, $clean['qa_quiz_actions']);
  }

  // global_actions
$clean['qa_global_actions'] = [];
if ( ! empty( $input['qa_global_actions'] ) && is_array( $input['qa_global_actions'] ) ) {
  foreach ( $input['qa_global_actions'] as $act ) {
    $lab = sanitize_text_field(   trim( $act['label'] ?? '' ) );
    $sys = wp_kses_post(          trim( $act['sys']   ?? '' ) );
    $usr = wp_kses_post(          trim( $act['user']  ?? '' ) );
    if ( $lab && $sys && $usr ) {
      $clean['qa_global_actions'][] = compact( 'lab','sys','usr' );
    }
  }
  // rename keys back to label/sys/user
  $clean['qa_global_actions'] = array_map(function($a){
    return [
      'label' => $a['lab'],
      'sys'   => $a['sys'],
      'user'  => $a['usr'],
    ];
  }, $clean['qa_global_actions'] );
}
  return $clean;
}
