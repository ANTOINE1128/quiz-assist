<?php
/**
 * Quiz Assist — uninstall cleanup
 *
 * This permanently deletes all plugin data:
 *  - Custom DB tables: wp_qa_chat_sessions, wp_qa_chat_messages
 *  - Options starting with quiz_assist_
 *  - Transients created by this plugin (qa_chat_tok_*, qa_rl_*)
 *  - Any scheduled cron events whose hook starts with qa_ or quiz_assist_
 *
 * Runs on plugin uninstall (not on deactivate).
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
    exit;
}

/**
 * Per-site cleanup.
 */
function qa_assist_uninstall_for_blog( $blog_id = null ) {
    if ( null !== $blog_id ) {
        switch_to_blog( (int) $blog_id );
    }

    global $wpdb;

    // --- 1) Drop custom tables (if they exist) ---
    $tables = array(
        $wpdb->prefix . 'qa_chat_sessions',
        $wpdb->prefix . 'qa_chat_messages',
    );

    foreach ( $tables as $t ) {
        // Use IF EXISTS to avoid errors if the table isn't there
        $wpdb->query( "DROP TABLE IF EXISTS `{$t}`" );
    }

    // --- 2) Remove options and settings ---
    // Known option keys
    delete_option( 'quiz_assist_options' );
    delete_option( 'quiz_assist_version' );

    // Remove any stray options under our plugin namespace.
    // (Safe: we only target our plugin's prefix.)
    $options_table = $wpdb->options;
    // Delete options like quiz_assist_xxx
    $wpdb->query( "DELETE FROM `{$options_table}` WHERE option_name LIKE 'quiz_assist\_%' ESCAPE '\\'" );

    // --- 3) Remove transients created by this plugin ---
    // We created transients like qa_chat_tok_* and qa_rl_*
    // Transients are stored as _transient_* and _transient_timeout_* in options.
    $wpdb->query( "DELETE FROM `{$options_table}` WHERE option_name LIKE '\_transient\_qa\_chat\_%' ESCAPE '\\'" );
    $wpdb->query( "DELETE FROM `{$options_table}` WHERE option_name LIKE '\_transient\_timeout\_qa\_chat\_%' ESCAPE '\\'" );
    $wpdb->query( "DELETE FROM `{$options_table}` WHERE option_name LIKE '\_transient\_qa\_rl\_%' ESCAPE '\\'" );
    $wpdb->query( "DELETE FROM `{$options_table}` WHERE option_name LIKE '\_transient\_timeout\_qa\_rl\_%' ESCAPE '\\'" );

    // If any site-wide (network) transients were ever used with these prefixes:
    $wpdb->query( "DELETE FROM `{$options_table}` WHERE option_name LIKE '\_site\_transient\_qa\_chat\_%' ESCAPE '\\'" );
    $wpdb->query( "DELETE FROM `{$options_table}` WHERE option_name LIKE '\_site\_transient\_timeout\_qa\_chat\_%' ESCAPE '\\'" );
    $wpdb->query( "DELETE FROM `{$options_table}` WHERE option_name LIKE '\_site\_transient\_qa\_rl\_%' ESCAPE '\\'" );
    $wpdb->query( "DELETE FROM `{$options_table}` WHERE option_name LIKE '\_site\_transient\_timeout\_qa\_rl\_%' ESCAPE '\\'" );

    // --- 4) Unschedule any cron jobs created by this plugin (defensive) ---
    if ( function_exists( '_get_cron_array' ) ) {
        $crons = _get_cron_array();
        if ( is_array( $crons ) ) {
            foreach ( $crons as $timestamp => $cronhooks ) {
                foreach ( $cronhooks as $hook => $events ) {
                    // Only touch our own hooks
                    if ( strpos( $hook, 'qa_' ) === 0 || strpos( $hook, 'quiz_assist_' ) === 0 ) {
                        foreach ( $events as $sig => $event ) {
                            $args = isset( $event['args'] ) ? (array) $event['args'] : array();
                            wp_unschedule_event( $timestamp, $hook, $args );
                        }
                    }
                }
            }
        }
    }

    if ( null !== $blog_id ) {
        restore_current_blog();
    }
}

/**
 * Run per-site cleanup for single site or all sites in a network.
 */
if ( is_multisite() ) {
    $sites = get_sites( array( 'fields' => 'ids' ) );
    foreach ( $sites as $site_id ) {
        qa_assist_uninstall_for_blog( (int) $site_id );
    }
} else {
    qa_assist_uninstall_for_blog();
}
