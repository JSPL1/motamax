# Entry point for cPanel "Setup Python App" (Phusion Passenger).
# Application startup file: passenger_wsgi.py   Application entry point: application
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pyserver.app import app as application  # noqa: E402,F401
