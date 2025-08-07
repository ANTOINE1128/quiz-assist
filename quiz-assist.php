<?php
/**
 * Plugin Name: Quiz Assist
 * Description: AI-powered quiz widget on quiz pages, plus a simple live-chat everywhere else.
 * Version:     1.0
 * Author:      Your Name
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

define( 'QA_DIR', plugin_dir_path( __FILE__ ) );
define( 'QA_URL', plugin_dir_url( __FILE__ ) );

// Activation: create chat tables
register_activation_hook( __FILE__, 'qa_install' );
function qa_install() {
    global $wpdb;
    $charset = $wpdb->get_charset_collate();
    $sess    = $wpdb->prefix . 'qa_chat_sessions';
    $msgs    = $wpdb->prefix . 'qa_chat_messages';
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';

    dbDelta( "
    CREATE TABLE {$sess} (
      id         mediumint(9) NOT NULL AUTO_INCREMENT,
      created_at datetime      NOT NULL,
      PRIMARY KEY (id)
    ) {$charset};
    " );

    dbDelta( "
    CREATE TABLE {$msgs} (
      id          mediumint(9) NOT NULL AUTO_INCREMENT,
      session_id  mediumint(9) NOT NULL,
      sender      varchar(20)  NOT NULL,
      message     text         NOT NULL,
      created_at  datetime     NOT NULL,
      PRIMARY KEY (id),
      KEY session_id (session_id)
    ) {$charset};
    " );
}

// core includes
require_once QA_DIR . 'includes/utils.php';
require_once QA_DIR . 'includes/settings.php';
require_once QA_DIR . 'includes/admin-pages.php';
require_once QA_DIR . 'includes/api-quiz.php';
require_once QA_DIR . 'api-chat.php';

// ─── Admin: load settings-page CSS ───────────────────────────────────────────────
add_action( 'admin_enqueue_scripts', function( $hook ) {
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

// ─── Front-end: conditional widgets ─────────────────────────────────────────────
add_action( 'wp_enqueue_scripts', function() {
    $uri = $_SERVER['REQUEST_URI'];

    if ( false !== strpos( $uri, '/quizzes/' ) ) {
        // ─── Quiz pages only ────────────────────────────────────────────
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
        $opts = get_option( 'quiz_assist_options', [] );
        wp_localize_script(
          'qa-quiz-widget',
          'QA_Assist_Quiz_Settings',
          [
            'apiBase'     => rest_url( 'quiz-assist/v1' ),
            'quizActions' => $opts['qa_quiz_actions'] ?? [],
          ]
        );
    } else {
        // ─── Everywhere else ───────────────────────────────────────────
        wp_enqueue_script(
          'qa-global-widget',
          QA_URL . 'assets/js/global-widget.js',
          [ 'wp-element' ],
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
            'apiBase'      => rest_url( 'quiz-assist/v1' ),
            'pollInterval' => 1000,
          ]
        );
    }
});

// mount the chat container (global widget only)
add_action( 'wp_footer', function(){
    echo '<div id="qa-global-root"></div>';
});
