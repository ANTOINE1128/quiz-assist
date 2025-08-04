<?php
/**
 * Plugin Name: Quiz Assist
 * Description: AI-powered quiz & site assistant for FarhatLectures.
 * Version:     2.1
 * Author:      Antoine Makdessy
 */

if ( ! defined( 'ABSPATH' ) ) exit;

define( 'QA_DIR', __DIR__ . '/' );
define( 'QA_URL', plugin_dir_url( __FILE__ ) );

// Activation: create sessions + messages (with is_read) tables
register_activation_hook( __FILE__, 'qa_install' );
function qa_install() {
    global $wpdb;
    $charset = $wpdb->get_charset_collate();
    $sess    = $wpdb->prefix . 'qa_chat_sessions';
    $msgs    = $wpdb->prefix . 'qa_chat_messages';
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';

    // sessions
    dbDelta( "
    CREATE TABLE {$sess} (
      id mediumint(9) NOT NULL AUTO_INCREMENT,
      created_at datetime NOT NULL,
      PRIMARY KEY  (id)
    ) {$charset};
    " );

    // messages, now including is_read
    dbDelta( "
    CREATE TABLE {$msgs} (
      id mediumint(9) NOT NULL AUTO_INCREMENT,
      session_id mediumint(9) NOT NULL,
      sender varchar(20) NOT NULL,
      message text NOT NULL,
      created_at datetime NOT NULL,
      is_read tinyint(1) NOT NULL DEFAULT 0,
      PRIMARY KEY  (id),
      KEY session_id (session_id)
    ) {$charset};
    " );
}

// Load core files
require_once QA_DIR . 'includes/utils.php';
require_once QA_DIR . 'includes/settings.php';
require_once QA_DIR . 'includes/admin-pages.php';
require_once QA_DIR . 'includes/api-quiz.php';
require_once QA_DIR . 'includes/api-global.php';
require_once QA_DIR . 'api-chat.php';

// Enqueue front-end assets (unchanged)
add_action( 'wp_enqueue_scripts', function() {
    // Quiz widget
    wp_enqueue_script(
      'qa-quiz-widget',
      QA_URL . 'assets/js/quiz-widget.js',
      [],
      filemtime( QA_DIR . 'assets/js/quiz-widget.js' ),
      true
    );
    wp_enqueue_style(
      'qa-quiz-widget-css',
      QA_URL . 'assets/css/quiz-widget.css',
      [],
      filemtime( QA_DIR . 'assets/css/quiz-widget.css' )
    );
    $opts        = get_option( 'quiz_assist_options', [] );
    $quizActions = $opts['qa_quiz_actions'] ?? [];
    wp_localize_script(
      'qa-quiz-widget',
      'QA_Assist_Quiz_Settings',
      [
        'apiBase'     => rest_url( 'quiz-assist/v1' ),
        'quizActions' => $quizActions,
      ]
    );

    // Global widget
    $globalActions = get_option( 'quiz_assist_options', [] )['qa_global_actions'] ?? [];
    wp_enqueue_script(
      'qa-global-widget',
      QA_URL . 'assets/js/global-widget.js',
      ['wp-element'],
      filemtime( QA_DIR . 'assets/js/global-widget.js' ),
      true
    );
    wp_enqueue_style(
      'qa-global-widget-css',
      QA_URL . 'assets/css/global-widget.css',
      [],
      filemtime( QA_DIR . 'assets/css/global-widget.css' )
    );
    wp_localize_script(
      'qa-global-widget',
      'QA_Assist_Global_SETTINGS',
      [
        'apiBase'       => rest_url( 'quiz-assist/v1' ),
        'globalActions' => $globalActions,
        'pollInterval'  => 2000,  // maybe bump to 2s for less resource usage
      ]
    );
} );

// Mount global chat
add_action( 'wp_footer', function(){
  if ( false !== strpos( $_SERVER['REQUEST_URI'], '/quizzes/' ) ) return;
  echo '<div id="qa-global-root"></div>';
} );
