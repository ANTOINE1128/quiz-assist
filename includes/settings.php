<?php
add_action('admin_init', 'qa_settings_init');
function qa_settings_init() {
    register_setting(
      'quizAssist',
      'quiz_assist_options',
      'qa_sanitize_options'
    );

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
      ['field'=>'qa_openai_key','type'=>'text']
    );

    // 2) Quiz Actions Repeater
    add_settings_field(
      'qa_quiz_actions',
      'Quiz Widget Actions',
      'qa_render_actions',
      'quizAssist',
      'qa_section'
    );

    // 3) Model selector
    add_settings_field(
      'qa_model',
      'OpenAI Model',
      'qa_render_model',
      'quizAssist',
      'qa_section'
    );

    // 4) Global chat system prompt
    add_settings_field(
      'qa_global_prompt',
      'Global Chat System Prompt',
      'qa_render_textarea',
      'quizAssist',
      'qa_section',
      ['field'=>'qa_global_prompt']
    );
}

function qa_render_actions() {
    $opts    = get_option('quiz_assist_options', []);
    $actions = $opts['qa_quiz_actions'] ?? [];

    echo '<div class="qa-card">';
    echo '<div class="qa-placeholders">';
    foreach ( ['{question}','{list}','{correct}','{incorrect}'] as $ph ) {
        printf('<span class="qa-chip">%s</span>', esc_html($ph));
    }
    echo '<p class="description" style="margin-top:8px;">Use these placeholders in your <em>User Prompt</em>.</p>';
    echo '</div>';
    ?>
    <table id="qa-actions-table">
      <thead>
        <tr>
          <th>Label</th>
          <th>System Prompt</th>
          <th>User Prompt</th>
          <th>Remove</th>
        </tr>
      </thead>
      <tbody>
        <?php foreach($actions as $i => $act): ?>
        <tr>
          <td>
            <input
              name="quiz_assist_options[qa_quiz_actions][<?= $i ?>][label]"
              value="<?= esc_attr( trim( $act['label'] ) ) ?>"
            />
          </td>
          <td>
            <textarea
              name="quiz_assist_options[qa_quiz_actions][<?= $i ?>][sys]"
              rows="3"
            ><?= esc_textarea( trim( $act['sys'] ?? '' ) ) ?></textarea>
          </td>
          <td>
            <textarea
              name="quiz_assist_options[qa_quiz_actions][<?= $i ?>][user]"
              rows="3"
            ><?= esc_textarea( trim( $act['user'] ?? '' ) ) ?></textarea>
          </td>
          <td>
            <button class="button qa-remove-action">Delete</button>
          </td>
        </tr>
        <?php endforeach; ?>
      </tbody>
    </table>

    <p>
      <button id="qa-add-action" class="button">+ Add Button</button>
    </p>

    <template id="qa-action-row-template">
      <tr>
        <td><input /></td>
        <td><textarea rows="3"></textarea></td>
        <td><textarea rows="3"></textarea></td>
        <td><button class="button qa-remove-action">Delete</button></td>
      </tr>
    </template>

    <script>
    (function($){
      let table = $('#qa-actions-table tbody');
      $('#qa-add-action').on('click', e => {
        e.preventDefault();
        let idx = table.children().length;
        let tpl = $($('#qa-action-row-template').html());
        tpl.find('input')
           .attr('name', `quiz_assist_options[qa_quiz_actions][${idx}][label]`);
        tpl.find('textarea').eq(0)
           .attr('name', `quiz_assist_options[qa_quiz_actions][${idx}][sys]`);
        tpl.find('textarea').eq(1)
           .attr('name', `quiz_assist_options[qa_quiz_actions][${idx}][user]`);
        table.append(tpl);
      });
      $(document).on('click', '.qa-remove-action', function(e){
        e.preventDefault();
        $(this).closest('tr').remove();
      });
    })(jQuery);
    </script>
    <?php
    echo '</div>';
}

/**
 * Render a <select> of all models your API key can access.
 */
function qa_render_model() {
  $opts     = get_option('quiz_assist_options', []);
  $current  = $opts['qa_model'] ?? 'gpt-4';
  $api_key  = trim( $opts['qa_openai_key'] ?? '' );

  if ( ! $api_key ) {
    echo '<p style="color:red;">Enter your OpenAI API key to load models.</p>';
    return;
  }

  // 1) Fetch models
  $resp = wp_remote_get( 'https://api.openai.com/v1/models', [
    'headers' => [
      'Authorization' => "Bearer {$api_key}",
      'Content-Type'  => 'application/json',
    ],
    'timeout' => 20,
  ] );

  if ( is_wp_error( $resp ) ) {
    echo '<p style="color:red;">Error fetching models: '
       . esc_html( $resp->get_error_message() )
       . '</p>';
    return;
  }

  $body = wp_remote_retrieve_body( $resp );
  $data = json_decode( $body, true );

  if ( empty( $data['data'] ) || ! is_array( $data['data'] ) ) {
    echo '<p style="color:red;">Unexpected response from OpenAI. '
       . 'Check your API key or your network settings.</p>';
    return;
  }

  // 2) Pull out model IDs
  $models = array_column( $data['data'], 'id' );
  sort( $models, SORT_NATURAL );

  // 3) Render <select>
  echo '<select name="quiz_assist_options[qa_model]">';
  foreach ( $models as $model_id ) {
    printf(
      '<option value="%1$s"%2$s>%1$s</option>',
      esc_attr( $model_id ),
      selected( $current, $model_id, false )
    );
  }
  echo '</select>';
}



function qa_render_text( $args ) {
    $opts = get_option('quiz_assist_options',[]);
    $val  = trim( $opts[$args['field']] ?? '' );
    printf(
      '<input type="%s" name="quiz_assist_options[%s]" value="%s" class="regular-text"/>',
      esc_attr($args['type']),
      esc_attr($args['field']),
      esc_attr($val)
    );
}

function qa_render_textarea( $args ) {
    $opts = get_option('quiz_assist_options',[]);
    $val  = trim( $opts[$args['field']] ?? '' );
    printf(
      '<textarea name="quiz_assist_options[%s]" rows="5" cols="80">%s</textarea>',
      esc_attr($args['field']),
      esc_textarea($val)
    );
}

function qa_sanitize_options( $input ) {
    $clean = [];

    // API Key
    $clean['qa_openai_key'] = sanitize_text_field( trim( $input['qa_openai_key'] ?? '' ) );

    // Quiz Actions
    $clean['qa_quiz_actions'] = [];
    if ( ! empty( $input['qa_quiz_actions'] ) && is_array( $input['qa_quiz_actions'] ) ) {
      foreach ( $input['qa_quiz_actions'] as $act ) {
        $label = sanitize_text_field( trim( $act['label'] ?? '' ) );
        $sys   = wp_kses_post(      trim( $act['sys']   ?? '' ) );
        $user  = wp_kses_post(      trim( $act['user']  ?? '' ) );
        if ( $label && $sys && $user ) {
          $clean['qa_quiz_actions'][] = compact('label','sys','user');
        }
      }
    }

    // Model choice
    $clean['qa_model'] = sanitize_text_field( trim( $input['qa_model'] ?? 'gpt-4' ) );

    // Global Prompt
    $clean['qa_global_prompt'] = wp_kses_post( trim( $input['qa_global_prompt'] ?? '' ) );

    return $clean;
}
