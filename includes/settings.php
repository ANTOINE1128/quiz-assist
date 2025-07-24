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

    // API Key
    add_settings_field(
      'qa_openai_key',
      'OpenAI API Key',
      'qa_render_text',
      'quizAssist',
      'qa_section',
      ['field'=>'qa_openai_key','type'=>'text']
    );

    // Quiz Actions Repeater
    add_settings_field(
      'qa_quiz_actions',
      'Quiz Widget Actions',
      'qa_render_actions',
      'quizAssist',
      'qa_section'
    );

    // Global chat
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

    // 1) Card container
    echo '<div class="qa-card">';

    // 2) Placeholder chips row
    echo '<div class="qa-placeholders">';
    foreach ( ['{question}','{list}','{correct}','{incorrect}'] as $ph ) {
        printf('<span class="qa-chip">%s</span>', esc_html($ph));
    }
    echo '<p class="description" style="margin-top:8px;">Use these placeholders in your <em>User Prompt</em>.</p>';
    echo '</div>';

    // 3) The table
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

    <!-- template for new rows -->
    <template id="qa-action-row-template">
      <tr>
        <td><input /></td>
        <td><textarea rows="3"></textarea></td>
        <td><textarea rows="3"></textarea></td>
        <td><button class="button qa-remove-action">Delete</button></td>
      </tr>
    </template>

    <!-- jQuery to handle add/remove -->
    <script>
    (function($){
      let table = $('#qa-actions-table tbody');
      $('#qa-add-action').on('click', function(e){
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

    // 4) Close card
    echo '</div>';
}

/**
 * Sanitize the entire options array.
 */
function qa_sanitize_options( $input ) {
    $clean = [];

    // 1) API key
    $clean['qa_openai_key'] = sanitize_text_field( trim( $input['qa_openai_key'] ?? '' ) );

    // 2) Quiz Actions repeater
    $clean['qa_quiz_actions'] = [];
    if ( ! empty( $input['qa_quiz_actions'] ) && is_array( $input['qa_quiz_actions'] ) ) {
      foreach ( $input['qa_quiz_actions'] as $act ) {
        $label = sanitize_text_field( trim( $act['label'] ?? '' ) );
        $sys   = wp_kses_post( trim( $act['sys']   ?? '' ) );
        $user  = wp_kses_post( trim( $act['user']  ?? '' ) );
        if ( $label && $sys && $user ) {
          $clean['qa_quiz_actions'][] = compact('label','sys','user');
        }
      }
    }

    // 3) Global system prompt
    $clean['qa_global_prompt'] = wp_kses_post( trim( $input['qa_global_prompt'] ?? '' ) );

    return $clean;
}

function qa_render_text( $args ) {
    $opts = get_option('quiz_assist_options',[]);
    $val  = isset( $opts[ $args['field'] ] )
          ? trim( $opts[ $args['field'] ] )
          : '';
    printf(
      '<input type="%s" name="quiz_assist_options[%s]" value="%s" class="regular-text"/>',
      esc_attr($args['type']),
      esc_attr($args['field']),
      esc_attr( $val )
    );
}

function qa_render_textarea( $args ) {
    $opts = get_option('quiz_assist_options',[]);
    $val  = isset( $opts[ $args['field'] ] )
          ? trim( $opts[ $args['field'] ] )
          : '';
    printf(
      '<textarea name="quiz_assist_options[%s]" rows="5" cols="80">%s</textarea>',
      esc_attr($args['field']),
      esc_textarea( $val )
    );
}
