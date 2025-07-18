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

    // Quiz actions: each gets _sys + _user
    $actions = ['explain_answer','wrong_explanation','explain_topic','generate_similar'];
    foreach( $actions as $act ) {
        qa_add_prompt_fields( $act, ucfirst(str_replace('_',' ',$act)) );
    }

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

function qa_add_prompt_fields($key,$label){
    // System
    add_settings_field(
      "qa_{$key}_sys",
      "{$label} – System Prompt",
      'qa_render_textarea',
      'quizAssist',
      'qa_section',
      ['field'=>"qa_{$key}_sys"]
    );
    // User
    add_settings_field(
      "qa_{$key}_user",
      "{$label} – User Prompt",
      'qa_render_textarea',
      'quizAssist',
      'qa_section',
      ['field'=>"qa_{$key}_user"]
    );
}

/**
 * Sanitize the entire options array.
 */
function qa_sanitize_options( $input ) {
    $clean = [];

    // 1) API key
    $clean['qa_openai_key'] = sanitize_text_field( $input['qa_openai_key'] ?? '' );

    // 2) Quiz prompts (each action gets _sys and _user)
    $actions = [ 'explain_answer', 'wrong_explanation', 'explain_topic', 'generate_similar' ];
    foreach ( $actions as $act ) {
        $sys_key = "qa_{$act}_sys";
        $usr_key = "qa_{$act}_user";
        $clean[ $sys_key ] = wp_kses_post( $input[ $sys_key ] ?? '' );
        $clean[ $usr_key ] = wp_kses_post( $input[ $usr_key ] ?? '' );
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

