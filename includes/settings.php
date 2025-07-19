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
    ?>
    <table id="qa-actions-table" class="widefat">
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
            <input name="quiz_assist_options[qa_quiz_actions][<?= $i ?>][label]"
                   value="<?= esc_attr($act['label']) ?>" class="regular-text"/>
          </td>
          <td>
            <textarea name="quiz_assist_options[qa_quiz_actions][<?= $i ?>][sys]"
                      rows="3" cols="40"><?= esc_textarea($act['sys']) ?></textarea>
          </td>
          <td>
            <textarea name="quiz_assist_options[qa_quiz_actions][<?= $i ?>][user]"
                      rows="3" cols="40"><?= esc_textarea($act['user']) ?></textarea>
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
        <td><input class="regular-text"/></td>
        <td><textarea rows="3" cols="40"></textarea></td>
        <td><textarea rows="3" cols="40"></textarea></td>
        <td><button class="button qa-remove-action">Delete</button></td>
      </tr>
    </template>

    <script>
    (function($){
      let table = $('#qa-actions-table tbody');
      $('#qa-add-action').on('click', function(e){
        e.preventDefault();
        let idx = table.children().length;
        let tpl = $($('#qa-action-row-template').html());
        tpl.find('input').attr('name', `quiz_assist_options[qa_quiz_actions][${idx}][label]`);
        tpl.find('textarea').eq(0)
           .attr('name', `quiz_assist_options[qa_quiz_actions][${idx}][sys]`);
        tpl.find('textarea').eq(1)
           .attr('name', `quiz_assist_options[qa_quiz_actions][${idx}][user]`);
        table.append(tpl);
      });
      $(document).on('click','.qa-remove-action',function(e){
        e.preventDefault();
        $(this).closest('tr').remove();
      });
    })(jQuery);
    </script>
    <?php
}

/**
 * Sanitize the entire options array.
 */
function qa_sanitize_options( $input ) {
    $clean = [];

    // 1) API key
    $clean['qa_openai_key'] = sanitize_text_field( $input['qa_openai_key'] ?? '' );

    // 2) Quiz Actions repeater
    $clean['qa_quiz_actions'] = [];
    if ( ! empty( $input['qa_quiz_actions'] ) && is_array( $input['qa_quiz_actions'] ) ) {
      foreach ( $input['qa_quiz_actions'] as $act ) {
        $label = sanitize_text_field( $act['label']   ?? '' );
        $sys   = wp_kses_post(      $act['sys']     ?? '' );
        $user  = wp_kses_post(      $act['user']    ?? '' );
        if ( $label && $sys && $user ) {
          $clean['qa_quiz_actions'][] = compact('label','sys','user');
        }
      }
    }

    // 3) Global system prompt
    $clean['qa_global_prompt'] = wp_kses_post( $input['qa_global_prompt'] ?? '' );

    return $clean;
}

function qa_render_text( $args ) {
    $opts = get_option('quiz_assist_options',[]);
    printf(
      '<input type="%s" name="quiz_assist_options[%s]" value="%s" class="regular-text"/>',
      esc_attr($args['type']),
      esc_attr($args['field']),
      esc_attr($opts[$args['field']] ?? '')
    );
}

function qa_render_textarea( $args ) {
    $opts = get_option('quiz_assist_options',[]);
    printf(
      '<textarea name="quiz_assist_options[%s]" rows="5" cols="80">%s</textarea>',
      esc_attr($args['field']),
      esc_textarea($opts[$args['field']] ?? '')
    );
}
