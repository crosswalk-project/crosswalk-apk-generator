grunt-tizen is a grunt plugin for installing, uninstalling, running and debugging applications on a Tizen device.

# Getting started

This plugin requires Grunt ~0.4.0.

If you are only interested in using grunt-tizen in your own project, you can install it with:

    npm install grunt-tizen --save-dev

Once the plugin has been installed, enable it with a line of JavaScript in your Gruntfile.js:

    module.exports = function (grunt) {
      grunt.loadNpmTasks('grunt-tizen');

      // grunt.initConfig() etc.
    };

If you are interested in contributing to the project, the HACKING.md file explains more about building grunt-tizen and running its test suite.

# Dependencies

Note that grunt-tizen depends on the <code>sdb</code> command line tool. This is available for various platforms from http://download.tizen.org/tools/latest-release/. If you want to use the <code>asRoot</code> option for the tizen task, you will need a very recent version of sdb with support for the "root" command (e.g. the tizen_2.0 branch). All of the other tizen:* tasks work with older versions of sdb, however.

Some familiarity with <code>sdb</code> can be useful in some situations, where grunt-tizen doesn't or can't hide the underlying implementation details of <code>sdb</code>. The aim over time is to reduce the visibility of that tool and properly encapsulate it.

You will also need a device running a recent version of Tizen 2.1/2.2. The device should be connected to the host running grunt via a USB connection.

This plugin has not been tested with multiple simultaneous USB connections to Tizen devices. It is unlikely to work in such an environment.

# General configuration

The shared configuration for both tasks (<code>tizen_prepare</code> and <code>tizen</code>) should be added to <code>grunt.initConfig()</code> as follows:

    grunt.initConfig({
      // ... other task configuration ...

      tizen_configuration: {
        // location on the device to install the tizen-app.sh script to
        // (default: '/tmp')
        tizenAppScriptDir: '/home/developer/',

        // path to the config.xml file for the Tizen wgt file
        // (default: 'config.xml')
        configFile: 'data/config.xml',

        // path to the sdb command (default: process.env.SDB or 'sdb')
        sdbCmd: '/home/bilbo/bin/sdb'
      }
   });

The <code>tizen-app.sh</code> script is a shell script which runs on Tizen devices, wrapping native Tizen commands to make them simpler to call remotely via <code>sdb shell</code>. It also does some of the work to interpret error messages and output from the Tizen commands to simplify the grunt-tizen code. You can find it in the <code>scripts</code> directory of the grunt-tizen source.

Configuration for grunt-tizen tasks is described below.

# Tasks

## tizen_prepare task

This task automates pushing the <code>tizen-app.sh</code> script to the attached device, overwriting any file already in the specified location. It also applies a <code>chmod +x</code> to the script to make it executable.

The destination of the file is <code>tizenAppScriptDir</code> (from tizen_configuration) + <code>'tizen-app.sh'</code>.

The task requires no configuration beyond that in the <code>tizen_configuration</code> section (see above).

Run it with:

    grunt tizen_prepare

You only need to run this task once to put the script in place. Once you've done this, you should be able to use the full range of commands to the tizen task, as described below.

It is also possible to run the <code>tizen-app.sh</code> script independently of grunt-tizen: see the script for details of how to invoke it.

## tizen task

The tizen task wraps the sdb command to perform various actions with a project.

The tizen task is actually a multitask, but is typically used to run different actions on the target device, specified by an <code>action</code> option (see *Options* below).

Note that several tasks rely on metadata from a <code>config.xml</code> file (Tizen package configuration XML file). A minimal version of this might look like:

```<?xml version="1.0" encoding="UTF-8"?>
<widget xmlns="http://www.w3.org/ns/widgets" xmlns:tizen="http://tizen.org/ns/widgets" id="https://github.com/01org/tetesttest" version="0.0.1" viewmodes="fullscreen">
    <name>test</name>
    <icon src="icon.png"/>
    <tizen:application id="tetesttest" required_version="1.0"/>
    <content src="index.html"/>
</widget>```

The two important pieces of data are the <code>id</code> attribute of the <code>widget</code> element; and the <code>id</code> of the <code>tizen:application</code> element. In grunt-tizen, these are referred to as the **app ID** and the **app URI** respectively. These identifiers are required by the <code>pkgcmd</code> and <code>wrt-launcher</code> commands on the Tizen device, and are automagically provided to the tizen-app.sh script when certain tizen task subcommands are invoked.

It is also important to note that these tasks are intended for the control of a single application, with a single config.xml file, and are not intended to control multiple applications simultaneously.

Having said that, the Bridge API (in <code>lib/bridge.js</code>) provides a low-level wrapper around <code>sdb</code> which is not tied to a single <code>config.xml</code> file. Alternative grunt tasks could be defined on top of the Bridge API if more flexibility were needed.

### Options

#### asRoot

Type: boolean
Default: false

If set to <code>true</code>, grunt-tizen attempts to run the action specified as the root user on the device. It does this by preceding the "real" action with a call to <code>sdb root on</code>, then calling the action, then calling <code>sdb root off</code>.

If the action fails, grunt-tizen will still attempt to call <code>sdb root off</code> to ensure that any further commands do not run as root.

If at any point you need to reset to the non-root user but are unable to do so via grunt-tizen, call the following directly instead:

    $ sdb root off

#### action

Type: string
Mandatory

The <em>action</em> option specifies which subcommand to run. The available values are:

*   **push:** Push one or more files to the device.
*   **install:** Install one or more wgt files which are already on the device.
*   **uninstall:** Uninstall an application which is already installed on the device.
*   **start:** Start an application already installed on the device.
*   **stop:** Stop an application which is running on the device.
*   **debug:** Start an application on the device in debug mode.
*   **script:** Run an arbitrary script/command on the device.

Each action has its own additional options, as described in the following sections.

### push

*   *localFiles*

    Type: string | string[] | object
    Mandatory

    *   If the value is a string, it is treated as a reference to a single file on the local filesystem. If a relative path, it is resolved relative to <code>Gruntfile.js</code>.
    *   If an array of strings, this option is treated as a reference to multiple files on the local filesystem.
    *   If an object, the value should have the following format:

            localFiles: {
              pattern: 'foo/bar/*',
              filter: 'latest'
            }

        *   The <code>pattern</code> property is a file glob pattern which is matched against local files.
        *   The <code>filter</code> property is optional. Currently only <code>'latest'</code> is supported. If set to this value, only the most recent of the files matching <code>pattern</code> is pushed.

*   *remoteDir*

    Type: string
    Mandatory

    The remote directory on the device to which the files specified by <code>localFiles</code> should be pushed.

    The destination filename for a local file is the basename of the local file joined to <code>remoteDir</code>.

*   *chmod*

    Type: string
    Default: null

    The chmod string to apply to each file after it is pushed to the device, to set permissions for the file. This can be a symbolic string (e.g. 'a+x') or an octal one (e.g. '0777').

*   *overwrite*

    Type: boolean
    Default: true

    If set to <code>true</code>, any existing file with a matching file name will be overwritten. If <code>false</code>, the action will fail if a file with the same path already exists on the device.

### start

*   *stopOnFailure*

    Type: boolean
    Default: false

    If the application cannot be started and this option is set to <code>true</code>, grunt will exit with an error. If <code>false</code>, any subsequent tasks will still run even if this task failed.

### stop

*   *stopOnFailure*

    Type: boolean
    Default: false

    If the application cannot be stopped and this option is set to <code>true</code>, grunt will exit with an error. If <code>false</code>, any subsequent tasks will still run even if this task failed.

### debug

*   *localPort*

    Type: integer
    Default: 8888

    If an application is started in debug mode, this specifies the local port which should be connected to the remote debug port on the device.

*   *browserCmd*

    Type: string
    Default: null

    Command to open a browser with the debug window for the application. If set, grunt-tizen will attempt to run the specified browser.

    The string should have a format like:

        'giggle-crom %URL%'

    The '%URL%' part of this provides a placeholder for grunt-tizen to insert the debug URL for the application.

At the moment, only Google Chrome is known to work as a debug client for Tizen apps.

*   *stopOnFailure*

    Type: boolean
    Default: false

    If the application cannot be started and this option is set to <code>true</code>, grunt will exit with an error. If <code>false</code>, any subsequent tasks will still run even if this task failed.

    Note that if you are debugging and any step in the debug sequence fails (i.e. if a remote port cannot be established on the device, or the browserCmd is not set), grunt will exit anyway. This option only has an effect on the application start itself.

### install

*   *remoteFiles*

    Type: string | string[] | object
    Mandatory

    Specifies the paths of wgt files on the device which should be installed.

    See <em>push options &gt; localFiles</em> (above) for the acceptable values.

### uninstall

*   *stopOnFailure*

    Type: boolean
    Default: false

    If the application cannot be uninstalled and this option is set to <code>true</code>, grunt will exit with an error. If <code>false</code>, any subsequent tasks will still run even if this task failed.

### script

By default, running this action invokes the specified remoteScript like this:

    remoteScript &lt;app ID&gt; &lt;app URI&gt;

where:

*   <code><app ID></code> is the value in the

Options:

*   *remoteScript*

    Type: string
    Mandatory

    Remote path on the device of the script to be executed.

*   *args*

    Type: string[]
    Default: []

    Extra arguments to pass to the script.


## Example Gruntfile.js

    grunt.initConfig({
      tizen_configuration: {
        tizenAppScriptDir: '/home/developer/',
        configFile: 'config.xml',
        sdbCmd: 'sdb'
      },

      tizen: {
        push: {
          action: 'push',
          localFiles: {
            pattern: 'build/*.wgt',
            filter: 'latest'
          },
          remoteDir: '/home/developer/'
        },

        install: {
          action: 'install',
          remoteFiles: {
            pattern: '/home/developer/*.wgt',
            filter: 'latest'
          }
        },

        uninstall: {
          action: 'uninstall'
        },

        start: {
          action: 'start',
          stopOnFailure: true
        },

        stop: {
          action: 'stop',
          stopOnFailure: false
        },

        debug: {
          action: 'debug',
          browserCmd: 'google-chrome %URL%',
          localPort: 9090,
          stopOnFailure: true
        }
      }
    });
