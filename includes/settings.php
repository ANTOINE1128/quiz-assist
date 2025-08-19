<?php
if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * Register settings, sections & fields.
 */
add_action( 'admin_init', 'qa_settings_init' );
function qa_settings_init() {
  register_setting( 'quizAssist', 'quiz_assist_options', 'qa_sanitize_options' );

  // -------- Sections --------
  add_settings_section('qa_section_core',   'Core / API',                       'qa_section_desc_core',   'quizAssist');
  add_settings_section('qa_section_global', 'Global Chat (Floating site-wide)', 'qa_section_desc_global', 'quizAssist');
  add_settings_section('qa_section_quiz',   'Quiz Widget (quiz pages only)',    'qa_section_desc_quiz',   'quizAssist');

  // ===== Core / API =====
  add_settings_field('qa_openai_key', 'OpenAI API Key', 'qa_render_text',  'quizAssist', 'qa_section_core',
    [ 'field'=>'qa_openai_key','type'=>'password' ]
  );
  add_settings_field('qa_model', 'OpenAI Model', 'qa_render_model', 'quizAssist', 'qa_section_core');

  // ===== Global Chat =====
  add_settings_field('qa_enable_global_chat',     'Enable Global Chat',                 'qa_render_enable_chat',         'quizAssist', 'qa_section_global');
  add_settings_field('qa_widget_offset',          'Global Chat Bottom Offset (px)',     'qa_render_widget_offset',       'quizAssist', 'qa_section_global');
  add_settings_field('qa_enable_quick_replies',   'Enable Quick Chats (Quick-Replies)', 'qa_render_enable_quickreplies', 'quizAssist', 'qa_section_global');
  add_settings_field('qa_global_actions',         'Quick-Replies (buttons)',            'qa_render_global_actions',      'quizAssist', 'qa_section_global');
  add_settings_field('qa_faqs',                   'FAQs (Resources)',                   'qa_render_faqs',                'quizAssist', 'qa_section_global');
  add_settings_field('qa_calendly_url',           'Calendly URL (Guest Booking)',       'qa_render_calendly_url',        'quizAssist', 'qa_section_global');

  // ===== Quiz Widget =====
  add_settings_field('qa_quiz_actions', 'Quiz Widget Actions', 'qa_render_actions', 'quizAssist', 'qa_section_quiz');
}

/** -------- Section descriptions -------- */
function qa_section_desc_core() {
  echo '<p>API credentials and model selection used by Quiz Assist.</p>';
}
function qa_section_desc_global() {
  echo '<p>Settings for the floating site-wide chat shown on non-quiz pages.</p>';
}
function qa_section_desc_quiz() {
  echo '<p>Buttons and prompts used inside the quiz page widget.</p>';
}

/** -------- Renderers -------- */

/** Checkbox: Enable Global Chat */
function qa_render_enable_chat() {
  $opts    = get_option( 'quiz_assist_options', [] );
  // default to enabled when option not set
  $enabled = ! isset( $opts['qa_enable_global_chat'] ) || ! empty( $opts['qa_enable_global_chat'] );
  ?>
  <label>
    <input type="checkbox" name="quiz_assist_options[qa_enable_global_chat]" value="1" <?php checked( $enabled ); ?> />
    Turn the floating site-wide chat on (hidden on quiz/topic pages automatically).
  </label>
  <p class="description">Uncheck to hide the blue chat button and panel everywhere.</p>
  <?php
}

/** Number: FAB bottom offset */
function qa_render_widget_offset() {
  $opts   = get_option( 'quiz_assist_options', [] );
  $offset = isset( $opts['qa_widget_offset'] ) ? (int) $opts['qa_widget_offset'] : 86;
  ?>
  <input type="number" min="0" max="500" step="1"
         name="quiz_assist_options[qa_widget_offset]"
         value="<?php echo esc_attr( $offset ); ?>"
         class="small-text" />
  <p class="description">Moves the blue chat button upward from the bottom-right. Default: 86.</p>
  <?php
}

/** Checkbox: Enable Quick-Replies */
function qa_render_enable_quickreplies() {
  $opts    = get_option( 'quiz_assist_options', [] );
  // default to enabled when option not set
  $enabled = ! isset( $opts['qa_enable_quick_replies'] ) || ! empty( $opts['qa_enable_quick_replies'] );
  ?>
  <label>
    <input type="checkbox" name="quiz_assist_options[qa_enable_quick_replies]" value="1" <?php checked( $enabled ); ?> />
    Show Quick-Reply buttons in the Global Chat.
  </label>
  <p class="description">Uncheck to completely hide the Quick-Reply (Quick Chat) buttons for all visitors.</p>
  <?php
}

/** Simple <input> */
function qa_render_text( $args ) {
  $opts = get_option( 'quiz_assist_options', [] );
  $val  = isset( $opts[ $args['field'] ] ) ? trim( $opts[ $args['field'] ] ) : '';
  printf(
    '<input type="%1$s" name="quiz_assist_options[%2$s]" value="%3$s" class="regular-text" autocomplete="off"/>',
    esc_attr( $args['type'] ),
    esc_attr( $args['field'] ),
    esc_attr( $val )
  );
}

/** Model select */
function qa_render_model() {
  $opts    = get_option( 'quiz_assist_options', [] );
  $current = $opts['qa_model'] ?? 'gpt-4';
  $apikey  = trim( $opts['qa_openai_key'] ?? '' );

  if ( ! $apikey ) {
    echo '<p style="color:#b91c1c;">Enter your OpenAI API Key above to load models.</p>';
    return;
  }

  $resp = wp_remote_get( 'https://api.openai.com/v1/models', [
    'headers' => [ 'Authorization' => "Bearer {$apikey}" ],
    'timeout' => 20,
  ] );
  if ( is_wp_error( $resp ) ) {
    echo '<p style="color:#b91c1c;">Error fetching models: ' . esc_html( $resp->get_error_message() ) . '</p>';
    return;
  }

  $data = json_decode( wp_remote_retrieve_body( $resp ), true );
  if ( empty( $data['data'] ) || ! is_array( $data['data'] ) ) {
    echo '<p style="color:#b91c1c;">Unexpected response when fetching models.</p>';
    return;
  }

  $models = array_column( $data['data'], 'id' );
  sort( $models, SORT_NATURAL );

  echo '<select name="quiz_assist_options[qa_model]">';
  foreach ( $models as $m ) {
    printf('<option value="%1$s"%2$s>%1$s</option>', esc_attr( $m ), selected( $current, $m, false ));
  }
  echo '</select>';
}

/** Quiz-widget actions repeater (correct field names) */
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
  ?>
  <table id="qa-actions-table" class="widefat striped">
    <thead>
      <tr>
        <th>Label</th><th>System Prompt</th><th>User Prompt</th><th>Remove</th>
      </tr>
    </thead>
    <tbody>
      <?php foreach( $actions as $i => $act ): ?>
        <tr>
          <td><input name="quiz_assist_options[qa_quiz_actions][<?= esc_attr($i) ?>][label]"
                     value="<?= esc_attr($act['label'] ?? '') ?>"/></td>
          <td><textarea name="quiz_assist_options[qa_quiz_actions][<?= esc_attr($i) ?>][sys]"
                        rows="2"><?= esc_textarea($act['sys'] ?? '') ?></textarea></td>
          <td><textarea name="quiz_assist_options[qa_quiz_actions][<?= esc_attr($i) ?>][user]"
                        rows="2"><?= esc_textarea($act['user'] ?? '') ?></textarea></td>
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
    $('#qa-add-action').on('click', function(e){
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
      tbody.children().each(function(i,tr){
        $(tr).find('input').attr('name',`quiz_assist_options[qa_quiz_actions][${i}][label]`);
        $(tr).find('textarea').eq(0).attr('name',`quiz_assist_options[qa_quiz_actions][${i}][sys]`);
        $(tr).find('textarea').eq(1).attr('name',`quiz_assist_options[qa_quiz_actions][${i}][user]`);
      });
    });
  })(jQuery);
  </script>
  <?php
  echo '</div>';
}

/** Global-chat quick replies (Label + Message) */
function qa_render_global_actions() {
  $opts    = get_option( 'quiz_assist_options', [] );
  $actions = $opts['qa_global_actions'] ?? [];
  ?>
  <div class="qa-card">
    <p class="description">Quick-reply buttons for the Global Chat. <strong>Tip:</strong> disable them entirely with the checkbox above.</p>
    <table id="qa-global-actions-table" class="widefat striped">
      <thead>
        <tr><th style="width:220px;">Label</th><th>Message</th><th style="width:90px;">Remove</th></tr>
      </thead>
      <tbody>
        <?php foreach( $actions as $i => $a ): ?>
          <tr>
            <td><input name="quiz_assist_options[qa_global_actions][<?= esc_attr($i) ?>][label]"
                       value="<?= esc_attr($a['label'] ?? '') ?>"/></td>
            <td><textarea rows="2" name="quiz_assist_options[qa_global_actions][<?= esc_attr($i) ?>][user]"><?= esc_textarea($a['user'] ?? '') ?></textarea></td>
            <td><button class="button qa-global-remove">Delete</button></td>
          </tr>
        <?php endforeach; ?>
      </tbody>
    </table>
    <p><button id="qa-global-add" class="button">+ Add Button</button></p>

    <template id="qa-global-row-tpl">
      <tr>
        <td><input/></td>
        <td><textarea rows="2"></textarea></td>
        <td><button class="button qa-global-remove">Delete</button></td>
      </tr>
    </template>
  </div>
  <script>
  (function($){
    const $tb = $('#qa-global-actions-table tbody');
    $('#qa-global-add').on('click', function(e){
      e.preventDefault();
      const idx = $tb.children().length;
      const $row = $($('#qa-global-row-tpl').html());
      $row.find('input').attr('name',`quiz_assist_options[qa_global_actions][${idx}][label]`);
      $row.find('textarea').eq(0).attr('name',`quiz_assist_options[qa_global_actions][${idx}][user]`);
      $tb.append($row);
    });
    $(document).on('click','.qa-global-remove',function(e){
      e.preventDefault();
      $(this).closest('tr').remove();
      $tb.children().each(function(i,tr){
        $(tr).find('input').attr('name',`quiz_assist_options[qa_global_actions][${i}][label]`);
        $(tr).find('textarea').eq(0).attr('name',`quiz_assist_options[qa_global_actions][${i}][user]`);
      });
    });
  })(jQuery);
  </script>
  <?php
}

/** FAQs repeater */
function qa_render_faqs() {
  $opts = get_option( 'quiz_assist_options', [] );
  $faqs = $opts['qa_faqs'] ?? [];
  ?>
  <div class="qa-card">
    <p class="description">Add questions and answers. These appear in the Global Chat “Resources” accordion.</p>
    <table id="qa-faqs-table" class="widefat striped">
      <thead>
        <tr>
          <th style="width:35%;">Question</th>
          <th>Answer</th>
          <th style="width:90px;">Remove</th>
        </tr>
      </thead>
      <tbody>
        <?php foreach ( $faqs as $i => $f ): ?>
          <tr>
            <td>
              <input type="text"
                     name="quiz_assist_options[qa_faqs][<?php echo esc_attr($i); ?>][q]"
                     value="<?php echo esc_attr( $f['q'] ?? '' ); ?>"
                     class="regular-text" />
            </td>
            <td>
              <textarea rows="3"
                        name="quiz_assist_options[qa_faqs][<?php echo esc_attr($i); ?>][a]"><?php
                echo esc_textarea( $f['a'] ?? '' );
              ?></textarea>
            </td>
            <td><button class="button qa-faq-remove">Delete</button></td>
          </tr>
        <?php endforeach; ?>
      </tbody>
    </table>
    <p><button id="qa-faqs-add" class="button">+ Add FAQ</button></p>
    <template id="qa-faqs-row-tpl">
      <tr>
        <td><input type="text" class="regular-text" /></td>
        <td><textarea rows="3"></textarea></td>
        <td><button class="button qa-faq-remove">Delete</button></td>
      </tr>
    </template>
  </div>
  <script>
  (function($){
    const $tbody = $('#qa-faqs-table tbody');
    $('#qa-faqs-add').on('click', function(e){
      e.preventDefault();
      const idx = $tbody.children().length;
      const $row = $($('#qa-faqs-row-tpl').html());
      $row.find('input').attr('name', `quiz_assist_options[qa_faqs][${idx}][q]`);
      $row.find('textarea').attr('name', `quiz_assist_options[qa_faqs][${idx}][a]`);
      $tbody.append($row);
    });
    $(document).on('click', '.qa-faq-remove', function(e){
      e.preventDefault();
      $(this).closest('tr').remove();
      $tbody.children().each(function(i,tr){
        $(tr).find('input').attr('name', `quiz_assist_options[qa_faqs][${i}][q]`);
        $(tr).find('textarea').attr('name', `quiz_assist_options[qa_faqs][${i}][a]`);
      });
    });
  })(jQuery);
  </script>
  <?php
}

/** Calendly URL field */
function qa_render_calendly_url() {
  $opts = get_option( 'quiz_assist_options', [] );
  $val  = trim( $opts['qa_calendly_url'] ?? '' );
  ?>
  <input type="url" class="regular-text" name="quiz_assist_options[qa_calendly_url]"
         value="<?php echo esc_attr($val); ?>" placeholder="https://calendly.com/yourname/30min" />
  <p class="description">Guest-only “Book a demo” uses this link (Calendly public scheduling URL).</p>
  <?php
}

/** -------- Sanitize -------- */
function qa_sanitize_options( $input ) {
  $clean = [];

  // Global chat toggles
  $clean['qa_enable_global_chat']   = isset( $input['qa_enable_global_chat'] )   ? 1 : 0;
  $clean['qa_enable_quick_replies'] = isset( $input['qa_enable_quick_replies'] ) ? 1 : 0;

  $offset = isset( $input['qa_widget_offset'] ) ? (int) $input['qa_widget_offset'] : 86;
  if ( $offset < 0 )   $offset = 0;
  if ( $offset > 500 ) $offset = 500;
  $clean['qa_widget_offset'] = $offset;

  // Core
  $clean['qa_openai_key'] = sanitize_text_field( trim( $input['qa_openai_key'] ?? '' ) );
  $clean['qa_model']      = sanitize_text_field( trim( $input['qa_model'] ?? 'gpt-4' ) );

  // Quiz actions (keep row when label+user exist; sys optional)
  $clean['qa_quiz_actions'] = [];
  if ( ! empty( $input['qa_quiz_actions'] ) && is_array( $input['qa_quiz_actions'] ) ) {
    foreach ( $input['qa_quiz_actions'] as $act ) {
      $lab = sanitize_text_field( trim( $act['label'] ?? '' ) );
      $sys = wp_kses_post(      trim( $act['sys']   ?? '' ) );
      $usr = wp_kses_post(      trim( $act['user']  ?? '' ) );
      if ( $lab && $usr ) {
        $clean['qa_quiz_actions'][] = [ 'label'=>$lab, 'sys'=>$sys, 'user'=>$usr ];
      }
    }
  }

  // Global quick replies
  $clean['qa_global_actions'] = [];
  if ( ! empty( $input['qa_global_actions'] ) && is_array( $input['qa_global_actions'] ) ) {
    foreach ( $input['qa_global_actions'] as $act ) {
      $lab = sanitize_text_field( trim( $act['label'] ?? '' ) );
      $usr = wp_kses_post(      trim( $act['user']  ?? '' ) );
      if ( $lab && $usr ) {
        $clean['qa_global_actions'][] = [ 'label'=>$lab, 'user'=>$usr ];
      }
    }
  }

  // FAQs
  $clean['qa_faqs'] = [];
  if ( ! empty( $input['qa_faqs'] ) && is_array( $input['qa_faqs'] ) ) {
    foreach ( $input['qa_faqs'] as $f ) {
      $q = sanitize_text_field( trim( $f['q'] ?? '' ) );
      $a = wp_kses_post(      trim( $f['a'] ?? '' ) );
      if ( $q && $a ) $clean['qa_faqs'][] = [ 'q' => $q, 'a' => $a ];
    }
  }

  // Calendly URL
  $url = trim( $input['qa_calendly_url'] ?? '' );
  $clean['qa_calendly_url'] = $url ? esc_url_raw( $url ) : '';

  return $clean;
}
