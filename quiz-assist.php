<?php
/**
 * Plugin Name: Quiz Assist
 * Description: AI‑powered quiz & site assistant for FarhatLectures.
 * Version:     1.9
 * Author:      Antoine Makdessy
 */

if ( ! defined('ABSPATH') ) exit;

define( 'QA_DIR', __DIR__ . '/' );
define( 'QA_URL', plugin_dir_url( __FILE__ ) );

// Load core files
require_once QA_DIR . 'includes/utils.php';
require_once QA_DIR . 'includes/settings.php';
require_once QA_DIR . 'includes/admin-pages.php';
require_once QA_DIR . 'includes/api-quiz.php';
require_once QA_DIR . 'includes/api-global.php';

// Enqueue admin assets
add_action('admin_enqueue_scripts', function( $hook ) {
    if ( 'toplevel_page_quiz_assist' !== $hook ) {
        return;
    }
    wp_enqueue_style(
      'qa-admin-css',
      QA_URL . 'assets/css/admin.css',
      [],
      filemtime( QA_DIR . 'assets/css/admin.css' )
    );
});

// Enqueue frontend assets
add_action('wp_enqueue_scripts', function(){
    // Quiz widget JS
    wp_enqueue_script(
      'qa-quiz-widget',
      QA_URL . 'assets/js/quiz-widget.js',
      [],
      filemtime( QA_DIR . 'assets/js/quiz-widget.js' ),
      true
    );
    // Quiz widget CSS
    wp_enqueue_style(
      'qa-quiz-widget-css',
      QA_URL . 'assets/css/quiz-widget.css',
      [],
      filemtime( QA_DIR . 'assets/css/quiz-widget.css' )
    );

    // Localize settings for quiz widget
    $opts        = get_option('quiz_assist_options', []);
    $quizActions = $opts['qa_quiz_actions'] ?? [];
    wp_localize_script(
      'qa-quiz-widget',
      'QA_Assist_Quiz_Settings',
      [
        'apiBase'     => rest_url('quiz-assist/v1'),
        'quizActions' => $quizActions,
      ]
    );

    // Global widget JS
    wp_enqueue_script(
      'qa-global-widget',
      QA_URL . 'assets/js/global-widget.js',
      ['wp-element'],
      filemtime( QA_DIR . 'assets/js/global-widget.js' ),
      true
    );
    // Localize settings for global widget
    wp_localize_script(
      'qa-global-widget',
      'QA_Assist_Global_Settings',
      ['apiBase' => rest_url('quiz-assist/v1')]
    );
});
